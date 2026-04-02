import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAdminUserId } from '@/lib/auth'
import { getSupabaseClient } from '@/lib/supabase'

const editCampaignSchema = z.object({
  name: z.string().min(1, 'Campaign name is required').max(200).optional(),
  tone_preset: z.enum(['professional', 'friendly', 'casual', 'empathetic', 'direct', 'authoritative', 'playful', 'sincere', 'nostalgic', 'consultative']).optional(),
  tone_custom: z.string().max(500).nullable().optional(),
  custom_instructions: z.string().max(2000).nullable().optional(),
  notify_client: z.boolean().optional(),
  send_booking_confirmation: z.boolean().optional(),
  send_booking_reminder: z.boolean().optional(),
  external_booking_url: z.union([
    z.string().url(),
    z.literal(''),
    z.null(),
  ]).optional(),
  // Channel can only be changed for non-active campaigns
  channel: z.enum(['email', 'sms', 'both']).optional(),
})

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ campaignId: string }> }
) {
  try {
    const adminUserId = await getAdminUserId()
    if (!adminUserId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { campaignId } = await params
    const supabase = getSupabaseClient()

    const { data: campaign, error: campaignError } = await supabase
      .from('campaigns')
      .select('id, status')
      .eq('id', campaignId)
      .single()

    if (campaignError || !campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
    }

    if (campaign.status === 'complete') {
      return NextResponse.json({ error: 'Cannot edit a completed campaign' }, { status: 400 })
    }

    const body = await req.json()
    const parsed = editCampaignSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
    }

    const updates = parsed.data

    // Prevent channel change while campaign is active — sequences are already scoped to a channel
    if (updates.channel && campaign.status === 'active') {
      return NextResponse.json(
        { error: 'Channel cannot be changed while the campaign is active' },
        { status: 400 }
      )
    }

    const { error: updateError } = await supabase
      .from('campaigns')
      .update(updates)
      .eq('id', campaignId)

    if (updateError) {
      console.error('[campaigns/edit] Update failed:', updateError.message)
      return NextResponse.json({ error: 'Failed to update campaign' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[campaigns/edit] Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
