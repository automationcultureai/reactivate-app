import { Resend } from 'resend'

/**
 * Sends a plain-text alert email to the admin inbox.
 * Gracefully skips if RESEND_API_KEY / RESEND_FROM_EMAIL / ADMIN_NOTIFICATION_EMAIL are not configured.
 * All callers must wrap this in try/catch — never let an alert failure
 * propagate to the caller's response.
 */
export async function sendAdminAlert(subject: string, body: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.RESEND_FROM_EMAIL
  const adminEmail = process.env.ADMIN_NOTIFICATION_EMAIL
  if (!apiKey || !from || !adminEmail) return // Gracefully skip if not configured

  const resend = new Resend(apiKey)
  await resend.emails.send({
    from,
    to: adminEmail,
    subject: `[Reactivate Alert] ${subject}`,
    text: body,
  })
}
