import type { SupabaseClient } from '@supabase/supabase-js'

// ============================================================
// Types
// ============================================================

export interface Recommendation {
  trigger: string
  message: string
}

export interface CampaignHealthResult {
  score: number
  tier: 'healthy' | 'moderate' | 'at_risk'
  bounceCount: number
  unsubscribeCount: number
  complaintCount: number
  openRate: number | null
  clickRate: number | null
  recommendations: Recommendation[]
}

// ============================================================
// Helpers
// ============================================================

function getTier(score: number): 'healthy' | 'moderate' | 'at_risk' {
  if (score >= 80) return 'healthy'
  if (score >= 60) return 'moderate'
  return 'at_risk'
}

// ============================================================
// Campaign-level health score
// ============================================================

/**
 * Calculates the health score for a single campaign.
 * Scores start at 100 and deductions are applied per the spec.
 * Returns null if the campaign has no leads.
 */
export async function calculateCampaignHealth(
  campaignId: string,
  supabase: SupabaseClient
): Promise<CampaignHealthResult> {
  // Get lead IDs for this campaign
  const { data: leadRows } = await supabase
    .from('leads')
    .select('id')
    .eq('campaign_id', campaignId)

  const leadIds = (leadRows ?? []).map((l: { id: string }) => l.id)

  if (leadIds.length === 0) {
    return {
      score: 100,
      tier: 'healthy',
      bounceCount: 0,
      unsubscribeCount: 0,
      complaintCount: 0,
      openRate: null,
      clickRate: null,
      recommendations: [],
    }
  }

  let score = 100
  const recommendations: Recommendation[] = []

  // --- Bounces (using send_failures as hard-bounce proxy) ---
  const { count: bounceRaw } = await supabase
    .from('send_failures')
    .select('id', { count: 'exact', head: true })
    .eq('campaign_id', campaignId)
    .eq('channel', 'email')

  const bounceCount = bounceRaw ?? 0
  score -= bounceCount * 2

  if (bounceCount > 0) {
    recommendations.push({
      trigger: 'high_bounce_rate',
      message:
        'Consider validating email addresses before the next campaign for this client. High bounce rates can trigger spam filters.',
    })
  }

  // --- Unsubscribes ---
  const { count: unsubRaw } = await supabase
    .from('leads')
    .select('id', { count: 'exact', head: true })
    .eq('campaign_id', campaignId)
    .or('email_opt_out.eq.true,status.eq.unsubscribed')

  const unsubscribeCount = unsubRaw ?? 0
  score -= unsubscribeCount * 1

  if (unsubscribeCount > 2) {
    recommendations.push({
      trigger: 'high_unsubscribe_rate',
      message:
        'Leads may be too old or outreach frequency is too high. Consider reducing to 3 emails instead of 4.',
    })
  }

  // --- Open rate and click rate (only meaningful if >= 10 sends) ---
  const { count: sentRaw } = await supabase
    .from('emails')
    .select('id', { count: 'exact', head: true })
    .in('lead_id', leadIds)
    .not('sent_at', 'is', null)

  const totalSent = sentRaw ?? 0
  let openRate: number | null = null
  let clickRate: number | null = null

  if (totalSent >= 10) {
    const [{ count: openRaw }, { count: clickRaw }] = await Promise.all([
      supabase
        .from('emails')
        .select('id', { count: 'exact', head: true })
        .in('lead_id', leadIds)
        .not('sent_at', 'is', null)
        .not('opened_at', 'is', null),
      supabase
        .from('emails')
        .select('id', { count: 'exact', head: true })
        .in('lead_id', leadIds)
        .not('sent_at', 'is', null)
        .not('clicked_at', 'is', null),
    ])

    openRate = parseFloat(((( openRaw ?? 0) / totalSent) * 100).toFixed(2))
    clickRate = parseFloat((((clickRaw ?? 0) / totalSent) * 100).toFixed(2))

    // Open rate deductions (mutually exclusive — replace, not cumulative)
    if (openRate < 5) {
      score -= 20
      recommendations.push({
        trigger: 'low_open_rate',
        message:
          "Subject lines for this client's campaigns are underperforming. Try more personalised or curiosity-driven subject lines.",
      })
    } else if (openRate < 10) {
      score -= 10
      recommendations.push({
        trigger: 'low_open_rate',
        message:
          "Subject lines for this client's campaigns are underperforming. Try more personalised or curiosity-driven subject lines.",
      })
    }

    // Click rate deduction
    if (clickRate < 1) {
      score -= 5
    }
  }

  score = Math.max(0, score)

  return {
    score,
    tier: getTier(score),
    bounceCount,
    unsubscribeCount,
    complaintCount: 0, // spam complaints not yet trackable
    openRate,
    clickRate,
    recommendations,
  }
}

// ============================================================
// Client aggregate score
// ============================================================

/**
 * Weighted average of all campaign scores for a client.
 * Weight = lead count per campaign.
 */
export function calculateClientAggregate(
  campaignScores: Array<{ score: number; leadCount: number }>
): { score: number; tier: 'healthy' | 'moderate' | 'at_risk' } {
  if (campaignScores.length === 0) return { score: 100, tier: 'healthy' }

  const totalLeads = campaignScores.reduce((s, c) => s + c.leadCount, 0)

  let aggregateScore: number
  if (totalLeads === 0) {
    aggregateScore = Math.round(
      campaignScores.reduce((s, c) => s + c.score, 0) / campaignScores.length
    )
  } else {
    aggregateScore = Math.round(
      campaignScores.reduce((s, c) => s + c.score * c.leadCount, 0) / totalLeads
    )
  }

  return { score: aggregateScore, tier: getTier(aggregateScore) }
}
