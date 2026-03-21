import { sendEmail } from '@/lib/email'
import { getSupabaseClient } from '@/lib/supabase'

export interface RetrySendResult {
  success: boolean
  resolved: boolean   // true if send succeeded
  maxedOut: boolean   // true if attempt_count hit MAX_SEND_RETRIES
  error?: string
}

/**
 * Retries a single failed email send.
 * Updates send_failures and leads tables accordingly.
 * Shared by both the manual retry route and the daily cron.
 */
export async function retryEmailSend(sendFailureId: string): Promise<RetrySendResult> {
  const supabase = getSupabaseClient()
  const maxSendRetries = parseInt(process.env.MAX_SEND_RETRIES ?? '3', 10)
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ''

  // 1. Fetch the failure record
  const { data: failure, error: failureError } = await supabase
    .from('send_failures')
    .select('*')
    .eq('id', sendFailureId)
    .single()

  if (failureError || !failure) {
    return { success: false, resolved: false, maxedOut: false, error: 'Failure record not found' }
  }

  if (failure.resolved) {
    return { success: true, resolved: true, maxedOut: false }
  }

  if (failure.attempt_count >= maxSendRetries) {
    // Mark lead as send_failed — no further retries
    await supabase
      .from('leads')
      .update({ status: 'send_failed' })
      .eq('id', failure.lead_id)
    return { success: false, resolved: false, maxedOut: true }
  }

  // 2. Fetch the lead
  const { data: lead } = await supabase
    .from('leads')
    .select('id, name, email, booking_token, email_opt_out, status, send_failure_count')
    .eq('id', failure.lead_id)
    .single()

  if (!lead || !lead.email) {
    return { success: false, resolved: false, maxedOut: false, error: 'Lead not found or has no email' }
  }

  // Safety checks before retry
  if (lead.email_opt_out || lead.status === 'deleted' || lead.status === 'unsubscribed') {
    await supabase
      .from('send_failures')
      .update({ resolved: true })
      .eq('id', sendFailureId)
    return { success: true, resolved: true, maxedOut: false }
  }

  // 3. Fetch the email record for this sequence
  const { data: emailRecord } = await supabase
    .from('emails')
    .select('id, subject, body, sent_at')
    .eq('lead_id', failure.lead_id)
    .eq('sequence_number', failure.sequence_number)
    .single()

  if (!emailRecord) {
    return { success: false, resolved: false, maxedOut: false, error: 'Email record not found' }
  }

  if (emailRecord.sent_at) {
    // Already sent — mark failure as resolved (no-op retry)
    await supabase.from('send_failures').update({ resolved: true }).eq('id', sendFailureId)
    return { success: true, resolved: true, maxedOut: false }
  }

  // 4. Fetch campaign + client for reply-to and footer details
  const { data: campaign } = await supabase
    .from('campaigns')
    .select('status, clients(name, email, business_name, business_address)')
    .eq('id', failure.campaign_id)
    .single()

  if (!campaign || campaign.status === 'paused' || campaign.status === 'complete') {
    return {
      success: false,
      resolved: false,
      maxedOut: false,
      error: `Campaign is ${campaign?.status ?? 'not found'} — skipping retry`,
    }
  }

  const clientData = campaign.clients as unknown as {
    name: string
    email: string
    business_name: string | null
    business_address: string | null
  } | null

  const clientEmail = clientData?.email ?? (process.env.GMAIL_USER ?? '')
  const clientBusinessName = clientData?.business_name ?? clientData?.name ?? undefined
  const clientBusinessAddress = clientData?.business_address ?? undefined
  const bookingUrl = `${appUrl}/book/${lead.booking_token}`

  // 5. Attempt the send
  try {
    await sendEmail({
      to: lead.email,
      subject: emailRecord.subject,
      body: emailRecord.body,
      bookingUrl,
      replyTo: clientEmail,
      emailId: emailRecord.id,
      leadToken: lead.booking_token,
      clientBusinessName,
      clientBusinessAddress,
    })

    // Success — mark failure resolved, update email.sent_at
    await Promise.all([
      supabase.from('send_failures').update({ resolved: true }).eq('id', sendFailureId),
      supabase
        .from('emails')
        .update({ sent_at: new Date().toISOString() })
        .eq('id', emailRecord.id),
    ])

    // Update lead status if this was Email 1
    if (failure.sequence_number === 1) {
      await supabase.from('leads').update({ status: 'emailed' }).eq('id', lead.id)
    }

    await supabase.from('lead_events').insert({
      lead_id: lead.id,
      event_type: 'email_sent',
      description: `Email ${failure.sequence_number} retry succeeded`,
    })

    return { success: true, resolved: true, maxedOut: false }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[retry-send] Send failed for failure ${sendFailureId}:`, message)

    const newAttemptCount = failure.attempt_count + 1
    const maxedOut = newAttemptCount >= maxSendRetries

    await supabase
      .from('send_failures')
      .update({
        attempt_count: newAttemptCount,
        error_message: message,
      })
      .eq('id', sendFailureId)

    await supabase
      .from('leads')
      .update({
        send_failure_count: (lead.send_failure_count ?? 0) + 1,
        ...(maxedOut ? { status: 'send_failed' } : {}),
      })
      .eq('id', lead.id)

    return { success: false, resolved: false, maxedOut, error: message }
  }
}
