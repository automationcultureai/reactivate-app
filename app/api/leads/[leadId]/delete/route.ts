import { NextRequest, NextResponse } from 'next/server'
import { getAdminUserId } from '@/lib/auth'
import { getSupabaseClient } from '@/lib/supabase'

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ leadId: string }> }
) {
  try {
    const adminUserId = await getAdminUserId()
    if (!adminUserId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { leadId } = await params
    const supabase = getSupabaseClient()

    // Verify lead exists
    const { data: lead, error: leadError } = await supabase
      .from('leads')
      .select('id, status')
      .eq('id', leadId)
      .single()

    if (leadError || !lead) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
    }

    if (lead.status === 'deleted') {
      return NextResponse.json({ error: 'Lead data has already been erased' }, { status: 409 })
    }

    // Anonymise personal data — NEVER hard delete (billing records must be retained)
    // name → "Deleted User", email → "deleted@deleted.com", phone → null, status → "deleted"
    const { error: updateError } = await supabase
      .from('leads')
      .update({
        name: 'Deleted User',
        email: 'deleted@deleted.com',
        phone: null,
        status: 'deleted',
        // booking_token stays to prevent token reuse / link resurrection
      })
      .eq('id', leadId)

    if (updateError) {
      console.error('[leads/delete] Anonymisation failed:', updateError.message)
      return NextResponse.json({ error: 'Failed to erase lead data' }, { status: 500 })
    }

    // Log the erasure event — retained for audit trail
    await supabase.from('lead_events').insert({
      lead_id: leadId,
      event_type: 'data_erased',
      description: `Personal data erased by admin (right to erasure). Booking records retained for billing.`,
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[leads/delete] Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
