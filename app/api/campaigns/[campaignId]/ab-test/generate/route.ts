import { NextRequest, NextResponse } from 'next/server'
import { getAdminUserId } from '@/lib/auth'
import { getSupabaseClient } from '@/lib/supabase'
import Anthropic from '@anthropic-ai/sdk'

const STEP_DESCRIPTIONS: Record<number, string> = {
  1: 'Initial reactivation — warm re-introduction to a dormant customer',
  2: 'Follow-up — second touch based on whether they opened/clicked Email 1',
  3: 'Final follow-up — last attempt before ending the sequence',
  4: 'Re-engagement — for leads who clicked but did not complete booking',
}

const TONE_MAP: Record<string, string> = {
  professional: 'formal, respectful, business-like',
  friendly: 'warm, approachable, conversational',
  casual: 'relaxed, informal, like a friend',
  urgent: 'time-sensitive, direct, action-focused',
  empathetic: 'understanding, caring, patient',
}

// POST /api/campaigns/[campaignId]/ab-test/generate
// Body: { sequence_number: number }
// Returns: { variant_a: string, variant_b: string }

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ campaignId: string }> }
) {
  const adminUserId = await getAdminUserId()
  if (!adminUserId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { campaignId } = await params
  const body = await req.json()
  const sequenceNumber = body.sequence_number as number

  if (!sequenceNumber || sequenceNumber < 1 || sequenceNumber > 4) {
    return NextResponse.json({ error: 'sequence_number must be 1–4' }, { status: 400 })
  }

  const supabase = getSupabaseClient()

  // Fetch campaign + client name
  const { data: campaign } = await supabase
    .from('campaigns')
    .select('tone_preset, tone_custom, custom_instructions, clients(name)')
    .eq('id', campaignId)
    .single()

  if (!campaign) {
    return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
  }

  const clientName = (campaign.clients as unknown as { name: string } | null)?.name ?? 'the business'
  const tone = TONE_MAP[campaign.tone_preset] ?? 'professional, respectful'
  const toneClause = campaign.tone_custom ? `${tone}. Additionally: ${campaign.tone_custom}.` : tone

  // Sample up to 5 existing subject lines for this step (gives Claude content context)
  const { data: sampleEmails } = await supabase
    .from('emails')
    .select('subject')
    .eq('sequence_number', sequenceNumber)
    .is('branch_variant', sequenceNumber <= 1 || sequenceNumber === 4 ? null : null)
    .limit(5)

  const sampleSubjects = (sampleEmails ?? [])
    .map((e) => e.subject)
    .filter(Boolean)
    .slice(0, 5)

  const sampleBlock =
    sampleSubjects.length > 0
      ? `\n\nExisting subject lines already generated for this step (for context only — do NOT reuse these):\n${sampleSubjects.map((s) => `- ${s}`).join('\n')}`
      : ''

  const instructionsBlock = campaign.custom_instructions
    ? `\n\nCampaign hard rules: ${campaign.custom_instructions}`
    : ''

  const prompt = `You are writing A/B test subject lines for a reactivation email campaign.

Business: ${clientName}
Email step: Email ${sequenceNumber} — ${STEP_DESCRIPTIONS[sequenceNumber] ?? ''}
Tone: ${toneClause}${sampleBlock}${instructionsBlock}

Generate exactly 2 distinct subject line variants that test different approaches. They should:
- Be clearly different from each other (different angle, emotion, or framing)
- Be concise (under 60 characters each)
- Avoid spam trigger words (FREE, WINNER, CLICK HERE, GUARANTEED, LIMITED TIME)
- Avoid ALL CAPS and excessive punctuation
- Feel natural — not clickbait

Return ONLY valid JSON with exactly these 2 keys, no explanation:
{"variant_a":"...","variant_b":"..."}`

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY not set' }, { status: 500 })
  }

  const client = new Anthropic({ apiKey })
  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 256,
    messages: [{ role: 'user', content: prompt }],
  })

  const rawText = message.content[0]?.type === 'text' ? message.content[0].text : ''

  // Extract JSON from response
  const jsonMatch = rawText.match(/\{[\s\S]*\}/)
  if (!jsonMatch) {
    console.error('[ab-test/generate] No JSON in response:', rawText)
    return NextResponse.json({ error: 'Claude returned no valid JSON' }, { status: 500 })
  }

  let result: { variant_a: string; variant_b: string }
  try {
    result = JSON.parse(jsonMatch[0])
  } catch {
    return NextResponse.json({ error: 'Failed to parse Claude response' }, { status: 500 })
  }

  if (!result.variant_a || !result.variant_b) {
    return NextResponse.json({ error: 'Claude response missing variant_a or variant_b' }, { status: 500 })
  }

  return NextResponse.json({ variant_a: result.variant_a, variant_b: result.variant_b })
}
