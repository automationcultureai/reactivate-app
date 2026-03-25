import { Resend } from 'resend'

// ============================================================
// Types
// ============================================================

export interface SendEmailOptions {
  to: string
  subject: string
  body: string                   // Plain text from Claude — may contain [BOOKING_LINK]
  bookingUrl: string             // Replaces [BOOKING_LINK] placeholder
  replyTo: string                // Client's contact email — lead replies go here
  emailId: string                // For the tracking pixel
  leadToken: string              // lead.booking_token — used in unsubscribe URL
  // Client business details for email footer (legal compliance)
  // These are shown in the footer instead of the agency env vars
  clientBusinessName?: string    // Falls back to AGENCY_NAME env var
  clientBusinessAddress?: string // Falls back to AGENCY_ADDRESS env var
}

// ============================================================
// Resend client
// ============================================================

function getResend() {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) throw new Error('RESEND_API_KEY environment variable is required')
  return new Resend(apiKey)
}

function getFromAddress() {
  const email = process.env.RESEND_FROM_EMAIL ?? 'onboarding@resend.dev'
  const name = process.env.RESEND_FROM_NAME
  return name ? `${name} <${email}>` : email
}

// ============================================================
// HTML email builder
// Always appends: tracking pixel, legal footer, unsubscribe link
// ============================================================

function buildHtmlEmail(
  body: string,
  bookingUrl: string,
  emailId: string,
  leadToken: string,
  clientBusinessName?: string,
  clientBusinessAddress?: string
): string {
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/$/, '')
  // Client business details take priority — agency env vars are fallback only
  const agencyName = clientBusinessName ?? process.env.AGENCY_NAME ?? 'Reactivate Agency'
  const agencyAddress = clientBusinessAddress ?? process.env.AGENCY_ADDRESS ?? ''
  const unsubscribeUrl = `${appUrl}/unsubscribe/${leadToken}`
  const trackingPixelUrl = `${appUrl}/api/track/open/${emailId}`

  // Replace [BOOKING_LINK] with a real anchor
  const bodyWithBooking = body.replace(
    /\[BOOKING_LINK\]/g,
    `<a href="${bookingUrl}" style="color:#0070f3;text-decoration:underline;">${bookingUrl}</a>`
  )

  // Preserve newlines as HTML breaks
  const htmlBody = bodyWithBooking.replace(/\n/g, '<br>\n')

  const footer = `
    <hr style="margin:32px 0;border:none;border-top:1px solid #e5e7eb;" />
    <p style="font-size:12px;color:#6b7280;margin:0 0 6px 0;line-height:1.5;">
      ${agencyName}${agencyAddress ? ` &nbsp;·&nbsp; ${agencyAddress}` : ''}
    </p>
    <p style="font-size:12px;color:#6b7280;margin:0;line-height:1.5;">
      <a href="${unsubscribeUrl}" style="color:#6b7280;text-decoration:underline;">Unsubscribe</a>
      &nbsp;&middot;&nbsp;
      <a href="${appUrl}/privacy" style="color:#6b7280;text-decoration:underline;">Privacy Policy</a>
      &nbsp;&middot;&nbsp;
      <a href="${appUrl}/terms" style="color:#6b7280;text-decoration:underline;">Terms</a>
    </p>
    <img src="${trackingPixelUrl}" width="1" height="1"
      style="display:none;border:0;width:1px;height:1px;overflow:hidden;" alt="" />
  `

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="color-scheme" content="light">
</head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;max-width:600px;margin:0 auto;padding:32px 24px;color:#111827;line-height:1.65;font-size:15px;background:#ffffff;">
  <div>${htmlBody}</div>
  ${footer}
</body>
</html>`
}

// ============================================================
// Plain text builder (fallback / List-Unsubscribe)
// ============================================================

function buildPlainText(
  body: string,
  bookingUrl: string,
  leadToken: string,
  clientBusinessName?: string,
  clientBusinessAddress?: string
): string {
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/$/, '')
  const agencyName = clientBusinessName ?? process.env.AGENCY_NAME ?? 'Reactivate Agency'
  const agencyAddress = clientBusinessAddress ?? process.env.AGENCY_ADDRESS ?? ''
  const unsubscribeUrl = `${appUrl}/unsubscribe/${leadToken}`

  const bodyWithBooking = body.replace(/\[BOOKING_LINK\]/g, bookingUrl)

  return `${bodyWithBooking}

---
${agencyName}${agencyAddress ? `\n${agencyAddress}` : ''}
Unsubscribe: ${unsubscribeUrl}
Privacy: ${appUrl}/privacy`
}

// ============================================================
// sendEmail — sends one campaign email via Resend
// Sets Reply-To, legal footer, tracking pixel server-side.
// Non-skippable per AI_rules.md.
// ============================================================

export async function sendEmail(options: SendEmailOptions): Promise<void> {
  const {
    to,
    subject,
    body,
    bookingUrl,
    replyTo,
    emailId,
    leadToken,
    clientBusinessName,
    clientBusinessAddress,
  } = options

  const resend = getResend()
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/$/, '')
  const unsubscribeUrl = `${appUrl}/unsubscribe/${leadToken}`

  const { error } = await resend.emails.send({
    from: getFromAddress(),
    to,
    subject,
    replyTo: replyTo,
    text: buildPlainText(body, bookingUrl, leadToken, clientBusinessName, clientBusinessAddress),
    html: buildHtmlEmail(body, bookingUrl, emailId, leadToken, clientBusinessName, clientBusinessAddress),
    headers: {
      'List-Unsubscribe': `<${unsubscribeUrl}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    },
  })

  if (error) throw new Error(`Resend error: ${error.message}`)
}

// ============================================================
// sendDelay — randomised 30–60 second delay between sends
// Kept for bulk send deliverability protection.
// ============================================================

export function sendDelay(): Promise<void> {
  const ms = Math.floor(Math.random() * 30_000) + 30_000 // 30–60 seconds
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// ============================================================
// sendBookingConfirmation — sent to lead after booking
// ============================================================

export async function sendBookingConfirmation(options: {
  to: string
  replyTo: string
  clientName: string
  scheduledAt: string
  leadToken: string
}): Promise<void> {
  const { to, replyTo, clientName, scheduledAt, leadToken } = options
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/$/, '')
  const agencyName = process.env.AGENCY_NAME ?? 'Reactivate Agency'
  const agencyAddress = process.env.AGENCY_ADDRESS ?? ''
  const unsubscribeUrl = `${appUrl}/unsubscribe/${leadToken}`

  const date = new Date(scheduledAt)
  const formatted = date.toLocaleString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

  const resend = getResend()
  const { error } = await resend.emails.send({
    from: getFromAddress(),
    to,
    subject: `Booking confirmed with ${clientName}`,
    replyTo: replyTo,
    html: `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:600px;margin:0 auto;padding:32px 24px;color:#111827;line-height:1.65;">
  <h2 style="margin:0 0 16px;">Your booking is confirmed</h2>
  <p>Your appointment with <strong>${clientName}</strong> is booked for:</p>
  <p style="font-size:18px;font-weight:600;color:#0070f3;">${formatted}</p>
  <p>If you need to reschedule or have any questions, please reply to this email.</p>
  <hr style="margin:32px 0;border:none;border-top:1px solid #e5e7eb;" />
  <p style="font-size:12px;color:#6b7280;">
    ${agencyName}${agencyAddress ? ` · ${agencyAddress}` : ''}<br>
    <a href="${unsubscribeUrl}" style="color:#6b7280;">Unsubscribe</a>
  </p>
</body></html>`,
    text: `Your booking is confirmed\n\nYour appointment with ${clientName} is booked for ${formatted}.\n\n---\n${agencyName}\nUnsubscribe: ${unsubscribeUrl}`,
  })

  if (error) throw new Error(`Resend error: ${error.message}`)
}

// ============================================================
// sendBookingReminder — sent to lead before appointment
// ============================================================

export async function sendBookingReminder(options: {
  to: string
  replyTo: string
  clientName: string
  scheduledAt: string
  leadToken: string
}): Promise<void> {
  const { to, replyTo, clientName, scheduledAt, leadToken } = options
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/$/, '')
  const agencyName = process.env.AGENCY_NAME ?? 'Reactivate Agency'
  const agencyAddress = process.env.AGENCY_ADDRESS ?? ''
  const unsubscribeUrl = `${appUrl}/unsubscribe/${leadToken}`

  const date = new Date(scheduledAt)
  const formatted = date.toLocaleString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  })

  const resend = getResend()
  const { error } = await resend.emails.send({
    from: getFromAddress(),
    to,
    subject: `Reminder: Your appointment with ${clientName} is tomorrow`,
    replyTo: replyTo,
    html: `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:600px;margin:0 auto;padding:32px 24px;color:#111827;line-height:1.65;">
  <h2 style="margin:0 0 16px;">Appointment reminder</h2>
  <p>Just a reminder that your appointment with <strong>${clientName}</strong> is scheduled for:</p>
  <p style="font-size:18px;font-weight:600;color:#0070f3;">${formatted}</p>
  <p>If you need to reschedule, please reply to this email.</p>
  <hr style="margin:32px 0;border:none;border-top:1px solid #e5e7eb;" />
  <p style="font-size:12px;color:#6b7280;">
    ${agencyName}${agencyAddress ? ` · ${agencyAddress}` : ''}<br>
    <a href="${unsubscribeUrl}" style="color:#6b7280;">Unsubscribe</a>
  </p>
</body></html>`,
    text: `Appointment reminder\n\nYour appointment with ${clientName} is scheduled for ${formatted}.\n\n---\n${agencyName}\nUnsubscribe: ${unsubscribeUrl}`,
  })

  if (error) throw new Error(`Resend error: ${error.message}`)
}

// ============================================================
// sendClientBookingNotification — sent to client when lead books
// ============================================================

export async function sendClientBookingNotification(options: {
  to: string
  leadName: string
  scheduledAt: string
  dashboardUrl: string
}): Promise<void> {
  const { to, leadName, scheduledAt, dashboardUrl } = options
  const agencyName = process.env.AGENCY_NAME ?? 'Reactivate Agency'

  const date = new Date(scheduledAt)
  const formatted = date.toLocaleString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

  const resend = getResend()
  const { error } = await resend.emails.send({
    from: getFromAddress(),
    to,
    subject: `New booking: ${leadName}`,
    html: `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:600px;margin:0 auto;padding:32px 24px;color:#111827;line-height:1.65;">
  <h2 style="margin:0 0 16px;">New booking received</h2>
  <p><strong>${leadName}</strong> has booked an appointment for <strong>${formatted}</strong>.</p>
  <p><a href="${dashboardUrl}" style="color:#0070f3;">View in your dashboard →</a></p>
  <hr style="margin:32px 0;border:none;border-top:1px solid #e5e7eb;" />
  <p style="font-size:12px;color:#6b7280;">${agencyName}</p>
</body></html>`,
    text: `New booking: ${leadName}\n\n${leadName} has booked for ${formatted}.\n\nView in dashboard: ${dashboardUrl}\n\n---\n${agencyName}`,
  })

  if (error) throw new Error(`Resend error: ${error.message}`)
}
