import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAdminUserId } from '@/lib/auth'
import { getSupabaseClient } from '@/lib/supabase'

const editEmailSchema = z.object({
  subject: z.string().min(1, 'Subject is required').max(300),
  body: z.string().min(1, 'Body is required').max(5000),
})

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ campaignId: string; emailId: string }> }
) {
  try {
    // 1. Admin auth
    const adminUserId = await getAdminUserId()
    if (!adminUserId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { campaignId, emailId } = await params

    // 2. Validate input
    const body = await req.json()
    const parsed = editEmailSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid input' },
        { status: 400 }
      )
    }

    const supabase = getSupabaseClient()

    // 3. Verify campaign status is "ready" — editing only allowed pre-send
    const { data: campaign, error: campaignError } = await supabase
      .from('campaigns')
      .select('status')
      .eq('id', campaignId)
      .single()

    if (campaignError || !campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
    }

    if (campaign.status !== 'ready') {
      return NextResponse.json(
        { error: `Cannot edit emails on a campaign with status "${campaign.status}" — only "ready" campaigns are editable` },
        { status: 400 }
      )
    }

    // 4. Verify email belongs to this campaign (security check via join)
    const { data: email, error: emailError } = await supabase
      .from('emails')
      .select('id, leads!inner(campaign_id)')
      .eq('id', emailId)
      .single()

    if (emailError || !email) {
      return NextResponse.json({ error: 'Email not found' }, { status: 404 })
    }

    const leadRef = email.leads as unknown as { campaign_id: string }
    if (leadRef?.campaign_id !== campaignId) {
      return NextResponse.json({ error: 'Email does not belong to this campaign' }, { status: 403 })
    }

    // 5. Update email
    const { data: updated, error: updateError } = await supabase
      .from('emails')
      .update({
        subject: parsed.data.subject,
        body: parsed.data.body,
      })
      .eq('id', emailId)
      .select()
      .single()

    if (updateError) {
      console.error('[emails/edit] Update failed:', updateError.message)
      return NextResponse.json({ error: 'Failed to update email' }, { status: 500 })
    }

    return NextResponse.json({ email: updated })
  } catch (err) {
    console.error('[emails/edit] Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
