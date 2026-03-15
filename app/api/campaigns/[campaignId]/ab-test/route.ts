import { NextRequest, NextResponse } from 'next/server'
import { getAdminUserId } from '@/lib/auth'
import { getSupabaseClient } from '@/lib/supabase'

// PUT /api/campaigns/[campaignId]/ab-test
// Upserts A/B test config for a single email step.
// Body: { sequence_number, ab_test_enabled, subject_variant_a?, subject_variant_b? }

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ campaignId: string }> }
) {
  const adminUserId = await getAdminUserId()
  if (!adminUserId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { campaignId } = await params
  const body = await req.json()
  const { sequence_number, ab_test_enabled, subject_variant_a, subject_variant_b } = body

  if (!sequence_number || typeof ab_test_enabled !== 'boolean') {
    return NextResponse.json(
      { error: 'sequence_number and ab_test_enabled are required' },
      { status: 400 }
    )
  }

  const supabase = getSupabaseClient()

  const { error } = await supabase.from('campaign_ab_tests').upsert(
    {
      campaign_id: campaignId,
      sequence_number,
      ab_test_enabled,
      subject_variant_a: subject_variant_a ?? null,
      subject_variant_b: subject_variant_b ?? null,
    },
    { onConflict: 'campaign_id,sequence_number' }
  )

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
