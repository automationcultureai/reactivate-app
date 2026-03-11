import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseClient } from '@/lib/supabase'
import { calculateCampaignHealth, calculateClientAggregate } from '@/lib/health-score'
import { sendAdminAlert } from '@/lib/alert'

export const maxDuration = 300

function verifyCronSecret(req: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) return false
  return req.headers.get('authorization') === `Bearer ${cronSecret}`
}

export async function POST(req: NextRequest) {
  if (!verifyCronSecret(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = getSupabaseClient()

  // Fetch all campaigns that are not paused (paused campaigns have frozen scores)
  const { data: campaigns, error } = await supabase
    .from('campaigns')
    .select('id, client_id, status')
    .not('status', 'eq', 'paused')

  if (error) {
    console.error('[cron/health-scores] Failed to fetch campaigns:', error.message)
    return NextResponse.json({ error: 'Failed to fetch campaigns' }, { status: 500 })
  }

  if (!campaigns || campaigns.length === 0) {
    return NextResponse.json({ message: 'No campaigns to score', processed: 0 })
  }

  const now = new Date().toISOString()
  let processed = 0
  let failed = 0

  // Group campaigns by client
  const campaignsByClient = new Map<string, typeof campaigns>()
  for (const c of campaigns) {
    if (!campaignsByClient.has(c.client_id)) campaignsByClient.set(c.client_id, [])
    campaignsByClient.get(c.client_id)!.push(c)
  }

  for (const [clientId, clientCampaigns] of campaignsByClient) {
    const campaignScores: Array<{ score: number; leadCount: number }> = []

    for (const campaign of clientCampaigns) {
      try {
        const result = await calculateCampaignHealth(campaign.id, supabase)

        const { count: leadCountRaw } = await supabase
          .from('leads')
          .select('id', { count: 'exact', head: true })
          .eq('campaign_id', campaign.id)

        const leadCount = leadCountRaw ?? 0

        await supabase.from('list_health_scores').insert({
          client_id: clientId,
          campaign_id: campaign.id,
          score: result.score,
          tier: result.tier,
          bounce_count: result.bounceCount,
          unsubscribe_count: result.unsubscribeCount,
          complaint_count: result.complaintCount,
          open_rate: result.openRate,
          click_rate: result.clickRate,
          recommendations: result.recommendations,
          calculated_at: now,
        })

        campaignScores.push({ score: result.score, leadCount })
        processed++
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error(`[cron/health-scores] Campaign ${campaign.id} failed:`, msg)
        failed++
      }
    }

    // Insert client aggregate score (campaign_id = null)
    if (campaignScores.length > 0) {
      const { score, tier } = calculateClientAggregate(campaignScores)
      await supabase.from('list_health_scores').insert({
        client_id: clientId,
        campaign_id: null,
        score,
        tier,
        bounce_count: 0,
        unsubscribe_count: 0,
        complaint_count: 0,
        open_rate: null,
        click_rate: null,
        recommendations: null,
        calculated_at: now,
      })
    }
  }

  if (failed > 0) {
    await sendAdminAlert(
      `Health score cron: ${failed} failure${failed !== 1 ? 's' : ''}`,
      `Health score cron completed with failures.\n\nProcessed: ${processed}\nFailed: ${failed}\nClients: ${campaignsByClient.size}`
    ).catch(console.error)
  }

  return NextResponse.json({
    success: true,
    processed,
    failed,
    clients: campaignsByClient.size,
    message: `Health scores updated: ${processed} campaigns across ${campaignsByClient.size} clients`,
  })
}
