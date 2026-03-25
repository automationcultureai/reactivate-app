import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAdminUserId } from '@/lib/auth'
import { getSupabaseClient } from '@/lib/supabase'

const bodySchema = z.object({
  lead_ids: z.array(z.string().uuid()).min(1).max(500),
  wave: z.union([z.literal(1), z.literal(2), z.literal(3)]),
})

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ campaignId: string }> }
) {
  try {
    const adminUserId = await getAdminUserId()
    if (!adminUserId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { campaignId } = await params
    const body = await req.json()
    const parsed = bodySchema.safeParse(body)
    if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })

    const { lead_ids, wave } = parsed.data
    const supabase = getSupabaseClient()

    const { error } = await supabase
      .from('leads')
      .update({ rfm_wave: wave })
      .eq('campaign_id', campaignId)
      .in('id', lead_ids)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ updated: lead_ids.length })
  } catch (err) {
    console.error('[leads/wave] Error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
