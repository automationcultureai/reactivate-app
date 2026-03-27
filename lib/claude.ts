import Anthropic from '@anthropic-ai/sdk'

// ============================================================
// Types
// ============================================================

export interface GeneratedEmail {
  subject: string
  body: string
}

export interface GeneratedEmailSequence {
  email1: GeneratedEmail
  email2_unopened: GeneratedEmail
  email2_opened: GeneratedEmail
  email2_clicked: GeneratedEmail
  email3_unopened: GeneratedEmail
  email3_opened: GeneratedEmail
  email3_clicked: GeneratedEmail
  email4: GeneratedEmail
}

export interface GeneratedSms {
  body: string
}

// ============================================================
// Tone preset → prompt language (from AI_rules.md)
// ============================================================

const TONE_MAP: Record<string, string> = {
  professional: 'formal, respectful, business-like',
  friendly: 'warm, approachable, conversational',
  casual: 'relaxed, informal, like a friend',
  empathetic: 'understanding, caring, patient',
  direct: 'concise, no-nonsense, gets straight to the point with no filler',
  authoritative: 'confident, expert-led, commands trust without being pushy',
  playful: 'lighthearted, witty, a touch of humour — never sarcastic',
  sincere: 'genuine, heartfelt, zero sales pressure — reads like a real person',
  nostalgic: 'leans into the past relationship, warm and sentimental reconnection',
  consultative: 'advisory, helpful, positions the sender as a trusted expert',
}

// ============================================================
// Internal helpers
// ============================================================

function getClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set')
  // Never pass the key to the browser — this function is server-only
  return new Anthropic({ apiKey })
}

function buildToneClause(tonePreset: string, toneCustom: string | null): string {
  const base = TONE_MAP[tonePreset] ?? 'professional, respectful, business-like'
  return toneCustom ? `${base}. Additionally: ${toneCustom}.` : base
}

function buildInstructionsBlock(customInstructions: string | null): string {
  if (!customInstructions) return ''
  return `\n\nHard rules you MUST follow:\n${customInstructions}`
}

function extractJsonFromText(text: string): string {
  const trimmed = text.trim()
  // 1. Try direct parse — Claude usually returns pure JSON with no preamble
  try { JSON.parse(trimmed); return trimmed } catch {}
  // 2. Strip markdown code fences
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fenceMatch) return fenceMatch[1].trim()
  // 3. Array before object — SMS sequences return arrays and the object regex
  //    strips the outer [] brackets, producing invalid JSON
  const arrayMatch = trimmed.match(/\[[\s\S]*\]/)
  if (arrayMatch) return arrayMatch[0]
  // 4. Fall back to object extraction for email sequence responses
  const objectMatch = trimmed.match(/\{[\s\S]*\}/)
  if (objectMatch) return objectMatch[0]
  return trimmed
}

// ============================================================
// generateEmailSequence
// ============================================================

/** Optional enrichment fields about a lead — all nullable */
export interface LeadContext {
  name: string
  last_contact_date?: string | null
  service_type?: string | null
  purchase_value?: string | null
  notes?: string | null
}

/**
 * Builds an optional context block injected into the Claude prompt.
 * Only includes fields that are non-blank — never adds empty lines.
 */
function buildLeadContextBlock(lead: LeadContext): string {
  const lines: string[] = []
  if (lead.last_contact_date) lines.push(`- Last contact date: ${lead.last_contact_date}`)
  if (lead.service_type) lines.push(`- Previous service type: ${lead.service_type}`)
  if (lead.purchase_value) lines.push(`- Previous job value: ${lead.purchase_value}`)
  if (lead.notes) lines.push(`- Notes: ${lead.notes}`)
  if (lines.length === 0) return ''
  return `\n\nAdditional context about this lead (reference naturally where relevant — don't repeat all fields verbatim):\n${lines.join('\n')}`
}

/**
 * Generates a branched 8-email reactivation sequence for a lead.
 * Email 1 and Email 4 are single. Emails 2 and 3 have 3 variants each
 * (unopened / opened / clicked) that are selected at send time based on
 * the lead's actual behaviour.
 *
 * Server-side only — never import this in client components.
 */
export async function generateEmailSequence(
  lead: LeadContext,
  clientBusiness: string,
  clientIndustry: string | null,
  tonePreset: string,
  toneCustom: string | null,
  customInstructions: string | null
): Promise<GeneratedEmailSequence> {
  const client = getClient()
  const tone = buildToneClause(tonePreset, toneCustom)
  const instructions = buildInstructionsBlock(customInstructions)
  const leadContext = buildLeadContextBlock(lead)
  const industryLine = clientIndustry ? `\nIndustry: ${clientIndustry}` : ''

  const prompt = `You are a direct response copywriter who specialises in reactivation campaigns for small businesses. Your job is to write email sequences that get dormant leads to book a job — not to sound impressive, not to sound like marketing, but to actually convert.

The psychology here is specific: this lead already knows the business. They're not a cold prospect. The relationship exists. Your job is to reawaken it — with copy that feels like it came from a real person at a business they've dealt with before, not a bulk email tool.

Lead name: ${lead.name}
Business name: ${clientBusiness}${industryLine}
Tone: ${tone}${leadContext}${instructions}

WHAT MAKES THIS COPY WORK:

1. Subject lines that earn the open
   - Write like a human, not a marketer — "Quick one, ${lead.name}" beats "Exclusive offer inside"
   - Make it specific to the relationship or the business where possible
   - Never clickbait. Never false urgency. Never ALL CAPS.
   - Each subject must be completely distinct — different angle, different structure

2. Body copy that converts
   - Open with something that earns attention in the first sentence — not a greeting, not a compliment, a hook
   - Reference the business naturally — not as a pitch, as context the lead already has
   - Keep it human: short sentences, plain language, no corporate tone
   - One idea per email. Don't stack benefits. Make one thing land.
   - The CTA must feel like the obvious next step, not a demand — make booking feel easy and low-risk
   - 150 words maximum. Every sentence must earn its place.

3. Behavioural variants must feel genuinely different
   - Unopened: assume they never saw it — try a completely different angle, subject, and opening
   - Opened but didn't act: they were curious but not convinced — address the hesitation, not the hook
   - Clicked but didn't book: they got close — acknowledge it directly, remove friction, make it dead simple
   - These are not minor rewrites. Each variant should read like a different person sent it on a different day with a different reason.

4. Spam avoidance is non-negotiable
   - No spam trigger words (FREE, WINNER, GUARANTEED, LIMITED TIME, CLICK HERE, ACT NOW)
   - No ALL CAPS words anywhere
   - No excessive punctuation (!!!, ???, ...)
   - No fake personalisation — if you don't have specific data, write something confident and general rather than inventing details

5. When lead data is rich (last service date, job type, job value):
   - Use it. Reference the service naturally. Acknowledge the time gap without making it awkward.
   - "It's been a while since your [service]" beats "We noticed you haven't booked recently"

6. When lead data is sparse (name and business only):
   - Don't fabricate. Don't write "[service type]" as a placeholder.
   - Write copy that works on the relationship itself — the prior connection is enough of a hook if the copy around it is sharp

Write exactly 8 emails with these keys:
- email1: Initial reactivation — warm re-entry, acknowledge the prior relationship, low-friction CTA
- email2_unopened: Different angle entirely — assume they never saw Email 1
- email2_opened: They were interested but didn't act — address the hesitation
- email2_clicked: They nearly booked — remove friction, make it easy to finish
- email3_unopened: Final attempt, lead has opened nothing — ultra brief, zero pressure, one last door open
- email3_opened: Final attempt, lead opened but never clicked — mild urgency, acknowledge their consideration
- email3_clicked: Final attempt, lead clicked twice but never booked — address the hesitation head-on, offer to help
- email4: Re-engagement for cancelled or incomplete bookings — acknowledge the near-miss, make rebooking feel easy

Non-negotiable rules:
- Every email body must be 150 words or fewer
- Include [BOOKING_LINK] exactly once per email body as a natural call to action — never as a raw URL label
- Each subject line must be unique and use a different structural approach
- Write in plain text — no HTML, no markdown, no bullet points in body copy
- Do not start any email with "Dear" — open naturally
- Do not include unsubscribe text — appended automatically
- Address the lead by first name at most once per email — not in every sentence
- No fake urgency. If there's a real reason to act now, use it. If not, don't invent one.

Return ONLY a valid JSON object with exactly these 8 keys. Each key maps to an object with "subject" and "body". No preamble, no explanation, no code blocks.
Format: {"email1":{"subject":"...","body":"..."},"email2_unopened":{"subject":"...","body":"..."},"email2_opened":{"subject":"...","body":"..."},"email2_clicked":{"subject":"...","body":"..."},"email3_unopened":{"subject":"...","body":"..."},"email3_opened":{"subject":"...","body":"..."},"email3_clicked":{"subject":"...","body":"..."},"email4":{"subject":"...","body":"..."}}`

  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 6000,
    messages: [{ role: 'user', content: prompt }],
  })

  const rawText = message.content[0]?.type === 'text' ? message.content[0].text : ''
  const jsonStr = extractJsonFromText(rawText)

  let seq: GeneratedEmailSequence
  try {
    seq = JSON.parse(jsonStr)
  } catch {
    throw new Error(
      `Claude returned invalid JSON for email sequence (lead: ${lead.name}). Raw: ${rawText.slice(0, 200)}`
    )
  }

  const REQUIRED_KEYS: (keyof GeneratedEmailSequence)[] = [
    'email1', 'email2_unopened', 'email2_opened', 'email2_clicked',
    'email3_unopened', 'email3_opened', 'email3_clicked', 'email4',
  ]

  for (const key of REQUIRED_KEYS) {
    if (typeof seq[key]?.subject !== 'string' || typeof seq[key]?.body !== 'string') {
      throw new Error(`Email key "${key}" for ${lead.name} is missing subject or body`)
    }
  }

  return seq
}

// ============================================================
// generateSmsSequence
// ============================================================

/**
 * Generates a personalised 4-SMS reactivation sequence for a lead.
 * Server-side only — never import this in client components.
 *
 * If emailSequence is provided (channel='both'), the SMS prompt receives
 * the email copy as context so each channel takes a distinct angle.
 *
 * Returns exactly 4 { body } objects or throws.
 * Each body is guaranteed ≤ 160 characters.
 */
export async function generateSmsSequence(
  lead: LeadContext,
  clientBusiness: string,
  clientIndustry: string | null,
  tonePreset: string,
  toneCustom: string | null,
  customInstructions: string | null,
  emailSequence?: GeneratedEmailSequence
): Promise<GeneratedSms[]> {
  const client = getClient()
  const tone = buildToneClause(tonePreset, toneCustom)
  const instructions = buildInstructionsBlock(customInstructions)
  const leadContext = buildLeadContextBlock(lead)
  const industryLine = clientIndustry ? `\nIndustry: ${clientIndustry}` : ''

  const emailContextBlock = emailSequence
    ? `\n\nThis lead is also receiving an email sequence. Each SMS fires only if the corresponding email went unopened after 48 hours. Write each SMS with a completely fresh angle — do not repeat the email's hook, phrasing, or CTA. Use a different entry point (e.g. if the email was warm/nostalgic, make the SMS direct/practical). Do not mention or reference email in the SMS copy.\n\nEmail copy for reference (do not repeat these angles):\n- Email 1: "${emailSequence.email1.body.slice(0, 140)}"\n- Email 2 (unopened follow-up): "${emailSequence.email2_unopened.body.slice(0, 100)}"\n- Email 3 (final attempt): "${emailSequence.email3_unopened.body.slice(0, 100)}"`
    : ''

  const prompt = `You are a direct response copywriter writing SMS reactivation messages for small businesses. SMS is not email — it's personal, it's immediate, and it gets read. That means the bar is higher: if it reads like a bulk text, it gets ignored or reported as spam.

The lead already knows this business. You are not introducing yourself to a stranger. You are reaching back out to someone who has a prior relationship with the sender — your job is to remind them of that relationship and make booking feel like the obvious, easy next step.

Lead name: ${lead.name}
Business name: ${clientBusiness}${industryLine}
Tone: ${tone}${leadContext}${emailContextBlock}${instructions}

WHAT MAKES SMS COPY WORK:

1. It reads like a real person sent it
   - Not a brand voice. Not a marketing department. A person at a business.
   - Contractions, short sentences, natural rhythm.
   - Never start with the business name as if it's a sender tag — work it in naturally.

2. It's specific enough to feel personal, not vague enough to feel like a blast
   - Use the lead's name once, naturally — not as an opener formula
   - Reference the business or service in a way that gives context: "the team at ${clientBusiness}" not just "${clientBusiness}"
   - If you have service or date data, use it. If you don't, write around it confidently.

3. Every message has one job
   - One idea. One CTA. One link. No stacking.
   - The link should feel like the natural endpoint of the message, not bolted on at the end.

4. Each message in the sequence must feel genuinely different
   - Different angle, different opening, different emotional register if needed
   - SMS 1: warm, personal re-entry
   - SMS 2: slightly different benefit or framing — not just "following up"
   - SMS 3: low pressure, acknowledge they may be busy, leave the door open
   - SMS 4: re-engagement for near-misses or cancellations — direct, frictionless, no guilt

5. Hard limits
   - 320 characters maximum per message including [BOOKING_LINK]
   - Include [BOOKING_LINK] naturally in each message — not as a dangling last line
   - No spam trigger words (FREE, WINNER, CLICK HERE, GUARANTEED, ACT NOW)
   - No ALL CAPS
   - No excessive punctuation
   - Do not include opt-out text — handled automatically
   - Plain conversational text only — no markdown, no bullet points

Return ONLY a valid JSON array with exactly 4 objects. Each object must have "body" only — no subject lines. No preamble, no explanation, no code blocks.
Format: [{"body":"..."},{"body":"..."},{"body":"..."},{"body":"..."}]`

  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    messages: [{ role: 'user', content: prompt }],
  })

  if (message.stop_reason === 'max_tokens') {
    throw new Error(
      `Claude hit the token limit generating SMS for ${lead.name} — output was truncated. Increase max_tokens or shorten the prompt.`
    )
  }

  const rawText = message.content[0]?.type === 'text' ? message.content[0].text : ''
  const jsonStr = extractJsonFromText(rawText)

  let smsList: GeneratedSms[]
  try {
    smsList = JSON.parse(jsonStr)
  } catch {
    throw new Error(
      `Claude returned invalid JSON for SMS sequence (lead: ${lead.name}). Raw: ${rawText.slice(0, 200)}`
    )
  }

  if (!Array.isArray(smsList) || smsList.length !== 4) {
    throw new Error(
      `Claude returned ${Array.isArray(smsList) ? smsList.length : 'non-array'} SMS for ${lead.name} — expected exactly 4`
    )
  }

  for (let i = 0; i < 4; i++) {
    if (typeof smsList[i]?.body !== 'string') {
      throw new Error(`SMS ${i + 1} for ${lead.name} is missing required body field`)
    }
    // Hard-cap at 320 chars (2 concatenated SMS segments) — safety net
    if (smsList[i].body.length > 320) {
      smsList[i].body = smsList[i].body.slice(0, 317) + '…'
    }
  }

  return smsList
}

// ============================================================
// generateAbSubjectPairs
// ============================================================

const AB_STEP_DESCRIPTIONS: Record<number, string> = {
  1: 'Initial reactivation — warm re-introduction to a dormant customer',
  2: 'Follow-up — second touch based on whether they opened/clicked Email 1',
  3: 'Final follow-up — last attempt before ending the sequence',
  4: 'Re-engagement — for leads who clicked but did not complete booking',
}

/**
 * Generates A/B subject line pairs for all 4 email steps in parallel.
 * Called automatically at the end of campaign generation.
 * Server-side only.
 */
export async function generateAbSubjectPairs(
  clientName: string,
  tonePreset: string,
  toneCustom: string | null,
  customInstructions: string | null
): Promise<Record<number, { variant_a: string; variant_b: string }>> {
  const client = getClient()
  const tone = buildToneClause(tonePreset, toneCustom)
  const instructionsBlock = customInstructions ? `\n\nCampaign hard rules: ${customInstructions}` : ''

  async function generatePair(seqNum: number): Promise<{ variant_a: string; variant_b: string }> {
    const prompt = `You are writing A/B test subject lines for a reactivation email campaign.

Business: ${clientName}
Email step: Email ${seqNum} — ${AB_STEP_DESCRIPTIONS[seqNum] ?? ''}
Tone: ${tone}${instructionsBlock}

Generate exactly 2 distinct subject line variants that test different approaches. They should:
- Be clearly different from each other (different angle, emotion, or framing)
- Be concise (under 60 characters each)
- Avoid spam trigger words (FREE, WINNER, CLICK HERE, GUARANTEED, LIMITED TIME)
- Avoid ALL CAPS and excessive punctuation
- Feel natural — not clickbait

Return ONLY valid JSON with exactly these 2 keys, no explanation:
{"variant_a":"...","variant_b":"..."}`

    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 256,
      messages: [{ role: 'user', content: prompt }],
    })

    const rawText = message.content[0]?.type === 'text' ? message.content[0].text : ''
    const jsonMatch = rawText.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error(`No JSON in A/B response for step ${seqNum}`)
    const result = JSON.parse(jsonMatch[0])
    if (!result.variant_a || !result.variant_b) throw new Error(`Missing variants for step ${seqNum}`)
    return result
  }

  const [pair1, pair2, pair3, pair4] = await Promise.all([
    generatePair(1),
    generatePair(2),
    generatePair(3),
    generatePair(4),
  ])

  return { 1: pair1, 2: pair2, 3: pair3, 4: pair4 }
}
