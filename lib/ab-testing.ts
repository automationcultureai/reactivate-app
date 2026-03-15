import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Randomly picks 'A' or 'B' with 50/50 probability.
 * Call at send time to assign each lead to a variant.
 */
export function pickAbVariant(): 'A' | 'B' {
  return Math.random() < 0.5 ? 'A' : 'B'
}

/**
 * Evaluates whether a winner should be declared for an A/B test step.
 *
 * Winner criteria (run after first_send_at + 4 hours):
 * - Both variants must have ≥5 sends
 * - Winner: one variant has ≥10% higher relative open rate than the other
 * - Otherwise: 'inconclusive' — sending continues to split 50/50
 *
 * Server-side only.
 */
export async function evaluateAbWinner(
  supabase: SupabaseClient,
  campaignId: string,
  sequenceNumber: number
): Promise<void> {
  const { data: test } = await supabase
    .from('campaign_ab_tests')
    .select('id, first_send_at, ab_winner, ab_variant_a_sends, ab_variant_b_sends, ab_variant_a_opens, ab_variant_b_opens')
    .eq('campaign_id', campaignId)
    .eq('sequence_number', sequenceNumber)
    .eq('ab_test_enabled', true)
    .is('ab_winner', null)
    .not('first_send_at', 'is', null)
    .maybeSingle()

  if (!test || !test.first_send_at) return

  // Not 4 hours old yet
  const msSinceFirst = Date.now() - new Date(test.first_send_at).getTime()
  if (msSinceFirst < 4 * 60 * 60 * 1000) return

  const aSends = test.ab_variant_a_sends ?? 0
  const bSends = test.ab_variant_b_sends ?? 0

  // Need at least 5 sends per side for meaningful data
  if (aSends < 5 || bSends < 5) {
    await supabase
      .from('campaign_ab_tests')
      .update({ ab_winner: 'inconclusive', ab_winner_selected_at: new Date().toISOString() })
      .eq('id', test.id)
    return
  }

  const rateA = (test.ab_variant_a_opens ?? 0) / aSends
  const rateB = (test.ab_variant_b_opens ?? 0) / bSends

  let winner: 'A' | 'B' | 'inconclusive' = 'inconclusive'
  if (rateA > rateB * 1.1) winner = 'A'
  else if (rateB > rateA * 1.1) winner = 'B'

  await supabase
    .from('campaign_ab_tests')
    .update({ ab_winner: winner, ab_winner_selected_at: new Date().toISOString() })
    .eq('id', test.id)
}
