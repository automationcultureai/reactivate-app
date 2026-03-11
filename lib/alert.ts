import nodemailer from 'nodemailer'

/**
 * Sends a plain-text alert email to the admin inbox.
 * Gracefully skips if GMAIL_USER / GMAIL_APP_PASSWORD are not configured.
 * All callers must wrap this in try/catch — never let an alert failure
 * propagate to the caller's response.
 */
export async function sendAdminAlert(subject: string, body: string): Promise<void> {
  const user = process.env.GMAIL_USER
  const pass = process.env.GMAIL_APP_PASSWORD
  if (!user || !pass) return // Gracefully skip if not configured

  const transport = nodemailer.createTransport({ service: 'gmail', auth: { user, pass } })
  await transport.sendMail({
    from: user,
    to: user,
    subject: `[Reactivate Alert] ${subject}`,
    text: body,
  })
}
