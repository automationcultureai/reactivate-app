import { getSupabaseClient } from '@/lib/supabase'

const SIX_MONTHS_MS = 6 * 30 * 24 * 60 * 60 * 1000
const TWELVE_MONTHS_MS = 12 * 30 * 24 * 60 * 60 * 1000

function recencyScore(lastPurchaseDate: string | null): number {
  if (!lastPurchaseDate) return 1
  const msSince = Date.now() - new Date(lastPurchaseDate).getTime()
  if (msSince < SIX_MONTHS_MS) return 3
  if (msSince < TWELVE_MONTHS_MS) return 2
  return 1
}

function frequencyScore(purchaseCount: number | null): number {
  if (purchaseCount === null) return 1
  if (purchaseCount >= 5) return 3
  if (purchaseCount >= 2) return 2
  return 1
}

/**
 * Calculates monetary scores for a set of leads.
 * Percentiles are relative to the campaign — not global.
 * Edge cases per spec:
 *   - Fewer than 9 leads → all scores = 2
 *   - All identical values → all scores = 2
 *   - Null value → score = 1
 */
function monetaryScores(lifetimeValues: (number | null)[]): number[] {
  const validValues = lifetimeValues.filter((v): v is number => v !== null)

  // Not enough leads for meaningful percentile split
  if (lifetimeValues.length < 9 || validValues.length === 0) {
    return lifetimeValues.map(() => 2)
  }

  // All identical values — no meaningful variation
  const allSame = validValues.every((v) => v === validValues[0])
  if (allSame) return lifetimeValues.map(() => 2)

  const sorted = [...validValues].sort((a, b) => a - b)
  const p33 = sorted[Math.floor(sorted.length * 0.33)]
  const p66 = sorted[Math.floor(sorted.length * 0.66)]

  return lifetimeValues.map((v) => {
    if (v === null) return 1
    if (v > p66) return 3
    if (v > p33) return 2
    return 1
  })
}

function waveFromTotal(total: number): number {
  if (total >= 7) return 1
  if (total >= 4) return 2
  return 3
}

/**
 * Scores all leads in a campaign and assigns them to a send wave.
 * Called after leads are inserted during campaign creation.
 * Leads without RFM data get total score = 4 (r=1, f=1, m=2) → Wave 2.
 */
export async function scoreAndWaveLeads(campaignId: string): Promise<void> {
  const supabase = getSupabaseClient()

  const { data: leads, error } = await supabase
    .from('leads')
    .select('id, last_purchase_date, purchase_count, lifetime_value')
    .eq('campaign_id', campaignId)
    .not('status', 'in', '(deleted,unsubscribed)')

  if (error) {
    console.error('[rfm] Failed to fetch leads for scoring:', error.message)
    return
  }

  if (!leads || leads.length === 0) return

  const mScores = monetaryScores(leads.map((l) => l.lifetime_value as number | null))

  for (let i = 0; i < leads.length; i++) {
    const lead = leads[i]
    const r = recencyScore(lead.last_purchase_date as string | null)
    const f = frequencyScore(lead.purchase_count as number | null)
    const m = mScores[i]
    const total = r + f + m
    const wave = waveFromTotal(total)

    await supabase
      .from('leads')
      .update({
        rfm_recency_score: r,
        rfm_frequency_score: f,
        rfm_monetary_score: m,
        rfm_total_score: total,
        rfm_wave: wave,
      })
      .eq('id', lead.id)
  }
}

/**
 * Returns a summary of wave counts for a campaign's leads.
 * Used on the preview screen.
 */
export function summariseWaves(leads: Array<{ rfm_wave: number }>): {
  wave1: number
  wave2: number
  wave3: number
  hasRfmData: boolean
} {
  const wave1 = leads.filter((l) => l.rfm_wave === 1).length
  const wave2 = leads.filter((l) => l.rfm_wave === 2).length
  const wave3 = leads.filter((l) => l.rfm_wave === 3).length
  // If all leads are wave 2, it indicates no RFM data was provided
  const hasRfmData = wave1 > 0 || wave3 > 0
  return { wave1, wave2, wave3, hasRfmData }
}
