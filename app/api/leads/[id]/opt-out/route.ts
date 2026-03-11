import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAdminUserId } from '@/lib/auth'
import { getSupabaseClient } from '@/lib/supabase'

const optOutSchema = z.object({
  email_opt_out: z.boolean(),
})

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const adminUserId = await getAdminUserId()
    if (!adminUserId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: leadId } = await params

    const body = await req.json()
    const parsed = optOutSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid input' },
        { status: 400 }
      )
    }

    const { email_opt_out } = parsed.data
    const supabase = getSupabaseClient()

    // Verify lead exists
    const { data: lead, error: fetchError } = await supabase
      .from('leads')
      .select('id, status, email')
      .eq('id', leadId)
      .single()

    if (fetchError || !lead) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
    }

    if (lead.status === 'deleted') {
      return NextResponse.json({ error: 'Cannot modify an erased lead' }, { status: 409 })
    }

    // Update opt-out status and lead status if opting out
    const updateData: Record<string, unknown> = { email_opt_out }
    if (email_opt_out && lead.status !== 'unsubscribed') {
      updateData.status = 'unsubscribed'
    } else if (!email_opt_out && lead.status === 'unsubscribed') {
      // Re-enabling: set back to pending so they can be emailed again
      updateData.status = 'pending'
    }

    const { error: updateError } = await supabase
      .from('leads')
      .update(updateData)
      .eq('id', leadId)

    if (updateError) {
      console.error('[leads/opt-out] Update failed:', updateError.message)
      return NextResponse.json({ error: 'Failed to update lead' }, { status: 500 })
    }

    // Log the event
    await supabase.from('lead_events').insert({
      lead_id: leadId,
      event_type: email_opt_out ? 'unsubscribed' : 'email_sent',
      description: email_opt_out
        ? 'Opted out by admin'
        : 'Re-enabled by admin — opted back in to email sequence',
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[leads/opt-out] Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
