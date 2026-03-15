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
  urgent: 'time-sensitive, direct, action-focused',
  empathetic: 'understanding, caring, patient',
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
  // Strip markdown code fences if Claude wrapped the JSON
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fenceMatch) return fenceMatch[1].trim()
  // Find the first {...} object block
  const objectMatch = text.match(/\{[\s\S]*\}/)
  if (objectMatch) return objectMatch[0]
  // Find the first [...] array block
  const arrayMatch = text.match(/\[[\s\S]*\]/)
  if (arrayMatch) return arrayMatch[0]
  return text.trim()
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
  tonePreset: string,
  toneCustom: string | null,
  customInstructions: string | null
): Promise<GeneratedEmailSequence> {
  const client = getClient()
  const tone = buildToneClause(tonePreset, toneCustom)
  const instructions = buildInstructionsBlock(customInstructions)
  const leadContext = buildLeadContextBlock(lead)

  const prompt = `You are a copywriter crafting personalised reactivation emails for a small business.

Lead name: ${lead.name}
Business name: ${clientBusiness}
Tone: ${tone}${leadContext}${instructions}

Write exactly 8 emails. Emails 2 and 3 each have 3 behaviour-based variants sent depending on what the lead did with the previous email:

- email1: Initial reactivation — warm re-introduction, acknowledge the time since last contact, easy CTA with booking link
- email2_unopened: Follow-up assuming lead never opened Email 1 — try a different angle or subject, keep it brief
- email2_opened: Follow-up assuming lead opened Email 1 but didn't act — acknowledge their interest, reinforce the value, gentle nudge
- email2_clicked: Follow-up assuming lead clicked the booking link but didn't complete — directly acknowledge the near-miss, make it easy to finish
- email3_unopened: Final attempt for a lead who has not opened any emails — very brief, low-pressure, last chance
- email3_opened: Final attempt for a lead who opened but never clicked — acknowledge their consideration, create mild urgency
- email3_clicked: Final attempt for a lead who clicked twice but didn't book — address the hesitation directly, offer to help
- email4: Re-engagement — for leads who clicked the booking link but didn't complete their booking, or whose appointment was cancelled — acknowledge the near-miss, offer to reschedule

Non-negotiable rules:
- Every email body must be 150 words or fewer
- No spam trigger words (e.g. FREE, WINNER, CLICK HERE, GUARANTEED, LIMITED TIME)
- No ALL CAPS words
- No excessive punctuation (!!!, ???, ...)
- Address the lead by name (${lead.name}) naturally — not in every line
- Include [BOOKING_LINK] exactly once per email body as a natural call to action — this will be replaced with the real URL
- Each subject line must be unique and not clickbait
- Write in plain text — no HTML, no markdown
- Do not start with "Dear" — begin naturally
- Do not include unsubscribe text — that is appended automatically

Return ONLY a valid JSON object with exactly these 8 keys. No preamble, no explanation, no code blocks.
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
 * Returns exactly 4 { body } objects or throws.
 * Each body is guaranteed ≤ 160 characters.
 */
export async function generateSmsSequence(
  lead: LeadContext,
  clientBusiness: string,
  tonePreset: string,
  toneCustom: string | null,
  customInstructions: string | null
): Promise<GeneratedSms[]> {
  const client = getClient()
  const tone = buildToneClause(tonePreset, toneCustom)
  const instructions = buildInstructionsBlock(customInstructions)
  const leadContext = buildLeadContextBlock(lead)

  const prompt = `You are writing personalised SMS reactivation messages for a small business.

Lead name: ${lead.name}
Business name: ${clientBusiness}
Tone: ${tone}${leadContext}${instructions}

Write exactly 4 SMS messages:
- SMS 1: Initial reactivation — short, personal, include booking link
- SMS 2: Follow-up — assume no reply to SMS 1
- SMS 3: Final follow-up — last attempt
- SMS 4: Re-engagement — for leads who clicked but didn't book or cancelled

Non-negotiable rules:
- Each message body must be 160 characters or fewer (including the literal text "[BOOKING_LINK]")
- Include [BOOKING_LINK] naturally in each message — it will be replaced with the real URL
- No spam trigger words
- Write personally to ${lead.name} — you may use their name once
- Count your characters carefully before returning — 160 is an absolute hard limit
- Do not include opt-out text — that is handled automatically

Return ONLY a valid JSON array with exactly 4 objects. No preamble, no explanation.
Format: [{"body":"..."},{"body":"..."},{"body":"..."},{"body":"..."}]`

  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    messages: [{ role: 'user', content: prompt }],
  })

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
    // Hard-cap at 160 chars — safety net if Claude exceeds the limit
    if (smsList[i].body.length > 160) {
      smsList[i].body = smsList[i].body.slice(0, 157) + '…'
    }
  }

  return smsList
}
