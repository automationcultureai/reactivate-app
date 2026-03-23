import twilio from 'twilio'

// ============================================================
// Config check
// ============================================================

/**
 * Returns true only when all required Twilio env vars are present.
 * Use as a guard before any SMS operation — never let missing
 * credentials crash the request lifecycle.
 */
export function isTwilioConfigured(): boolean {
  return !!(
    process.env.TWILIO_ACCOUNT_SID &&
    process.env.TWILIO_AUTH_TOKEN &&
    process.env.TWILIO_PHONE_NUMBER
  )
}

// ============================================================
// Twilio client factory (server-only)
// ============================================================

function getClient() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID
  const authToken = process.env.TWILIO_AUTH_TOKEN

  if (!accountSid || !authToken) {
    throw new Error('TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN are required')
  }

  return twilio(accountSid, authToken)
}

// ============================================================
// sendSms
// Replaces [BOOKING_LINK] and sends via Twilio.
// Server-only — never import in client components.
// ============================================================

export async function sendSms(
  to: string,
  body: string,
  bookingUrl: string
): Promise<void> {
  const from = process.env.TWILIO_PHONE_NUMBER
  if (!from) throw new Error('TWILIO_PHONE_NUMBER is required')

  const messageBody = body.replace(/\[BOOKING_LINK\]/g, bookingUrl)
  const client = getClient()

  await client.messages.create({ to, from, body: messageBody })
}

// ============================================================
// verifyWebhookSignature
// Must be called before processing any inbound Twilio webhook.
// ============================================================

export function verifyWebhookSignature(
  signature: string,
  url: string,
  params: Record<string, string>
): boolean {
  const authToken = process.env.TWILIO_AUTH_TOKEN
  if (!authToken) return false
  if (!signature) return false
  return twilio.validateRequest(authToken, signature, url, params)
}
