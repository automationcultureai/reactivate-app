import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAdminUserId } from '@/lib/auth'
import { getSupabaseClient } from '@/lib/supabase'

const editSmsSchema = z.object({
  body: z.string().min(1, 'Body is required').max(160, 'SMS body must be 160 characters or fewer'),
})

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ campaignId: string; smsId: string }> }
) {
  try {
    // 1. Admin auth
    const adminUserId = await getAdminUserId()
    if (!adminUserId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { campaignId, smsId } = await params

    // 2. Validate input
    const body = await req.json()
    const parsed = editSmsSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid input' },
        { status: 400 }
      )
    }

    const supabase = getSupabaseClient()

    // 3. Verify campaign is in an editable state
    const { data: campaign, error: campaignError } = await supabase
      .from('campaigns')
      .select('status')
      .eq('id', campaignId)
      .single()

    if (campaignError || !campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
    }

    const editableStatuses = ['ready', 'active', 'paused']
    if (!editableStatuses.includes(campaign.status)) {
      return NextResponse.json(
        { error: `Cannot edit SMS on a "${campaign.status}" campaign` },
        { status: 400 }
      )
    }

    // 4. Verify SMS belongs to this campaign (security check via join)
    const { data: sms, error: smsError } = await supabase
      .from('sms_messages')
      .select('id, leads!inner(campaign_id)')
      .eq('id', smsId)
      .single()

    if (smsError || !sms) {
      return NextResponse.json({ error: 'SMS not found' }, { status: 404 })
    }

    const leadRef = sms.leads as unknown as { campaign_id: string }
    if (leadRef?.campaign_id !== campaignId) {
      return NextResponse.json({ error: 'SMS does not belong to this campaign' }, { status: 403 })
    }

    // 5. Update SMS
    const { data: updated, error: updateError } = await supabase
      .from('sms_messages')
      .update({ body: parsed.data.body })
      .eq('id', smsId)
      .select()
      .single()

    if (updateError) {
      console.error('[sms-messages/edit] Update failed:', updateError.message)
      return NextResponse.json({ error: 'Failed to update SMS' }, { status: 500 })
    }

    return NextResponse.json({ sms: updated })
  } catch (err) {
    console.error('[sms-messages/edit] Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
