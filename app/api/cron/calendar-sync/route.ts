import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseClient } from '@/lib/supabase'
import { checkBookingStatus } from '@/lib/calendar'
import { sendEmail } from '@/lib/email'
import { sendAdminAlert } from '@/lib/alert'

export const maxDuration = 300

function verifyCronSecret(req: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) return false
  return req.headers.get('authorization') === `Bearer ${cronSecret}`
}

export async function POST(req: NextRequest) {
  if (!verifyCronSecret(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = getSupabaseClient()
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/$/, '')

  // Fetch all "booked" bookings that have a Google Calendar event ID
  // Join to clients to get google_calendar_id + email details
  const { data: bookings, error } = await supabase
    .from('bookings')
    .select(`
      id,
      lead_id,
      client_id,
      google_event_id,
      clients!inner(
        google_calendar_id,
        email,
        name,
        business_name,
        business_address
      )
    `)
    .eq('status', 'booked')
    .not('google_event_id', 'is', null)

  if (error) {
    console.error('[cron/calendar-sync] Failed to fetch bookings:', error.message)
    return NextResponse.json({ error: 'Failed to fetch bookings' }, { status: 500 })
  }

  if (!bookings || bookings.length === 0) {
    return NextResponse.json({ message: 'No active bookings to sync', cancelled: 0 })
  }

  let cancelled = 0
  let failed = 0
  let reengagementSent = 0

  for (const booking of bookings) {
    const client = booking.clients as unknown as {
      google_calendar_id: string | null
      email: string
      name: string
      business_name: string | null
      business_address: string | null
    }

    if (!client.google_calendar_id || !booking.google_event_id) continue

    let eventStatus: 'confirmed' | 'cancelled' | null

    try {
      eventStatus = await checkBookingStatus(client.google_calendar_id, booking.google_event_id)
    } catch (err) {
      console.error(
        `[cron/calendar-sync] checkBookingStatus failed for booking ${booking.id}:`,
        err
      )
      failed++
      continue
    }

    // Skip if still confirmed
    if (eventStatus === 'confirmed') continue

    // Event is cancelled or deleted (null) — mark the booking cancelled
    const { error: bookingUpdateError } = await supabase
      .from('bookings')
      .update({ status: 'cancelled' })
      .eq('id', booking.id)

    if (bookingUpdateError) {
      console.error('[cron/calendar-sync] Failed to cancel booking:', bookingUpdateError.message)
      failed++
      continue
    }

    // Update lead status to "cancelled"
    await supabase
      .from('leads')
      .update({ status: 'cancelled' })
      .eq('id', booking.lead_id)

    // Log the event
    await supabase.from('lead_events').insert({
      lead_id: booking.lead_id,
      event_type: 'booking_cancelled',
      description: `Booking cancelled — Google Calendar event ${eventStatus === null ? 'deleted' : 'cancelled'}`,
    })

    cancelled++

    // Optionally send re-engagement Email 4 to the cancelled lead
    // Fetch lead details + campaign settings
    const { data: lead } = await supabase
      .from('leads')
      .select('id, name, email, booking_token, email_opt_out, campaign_id')
      .eq('id', booking.lead_id)
      .single()

    if (!lead || !lead.email || lead.email_opt_out) continue

    const { data: campaign } = await supabase
      .from('campaigns')
      .select('status, channel')
      .eq('id', lead.campaign_id)
      .single()

    // Only send re-engagement if campaign is still active and includes email
    if (
      !campaign ||
      campaign.status !== 'active' ||
      (campaign.channel !== 'email' && campaign.channel !== 'both')
    ) {
      continue
    }

    // Fetch Email 4 for this lead — only send if not already sent
    const { data: email4 } = await supabase
      .from('emails')
      .select('id, subject, body, sent_at')
      .eq('lead_id', lead.id)
      .eq('sequence_number', 4)
      .single()

    if (!email4 || email4.sent_at) continue  // Not generated or already sent

    const clientBusinessName = client.business_name ?? client.name
    const clientBusinessAddress = client.business_address ?? undefined
    const bookingUrl = `${appUrl}/book/${lead.booking_token}`

    try {
      await sendEmail({
        to: lead.email,
        subject: email4.subject,
        body: email4.body,
        bookingUrl,
        replyTo: client.email,
        emailId: email4.id,
        leadToken: lead.booking_token,
        clientBusinessName,
        clientBusinessAddress,
      })

      await supabase
        .from('emails')
        .update({ sent_at: new Date().toISOString() })
        .eq('id', email4.id)

      await supabase.from('lead_events').insert({
        lead_id: lead.id,
        event_type: 'email_sent',
        description: 'Email 4 sent (re-engagement after booking cancellation)',
      })

      reengagementSent++
    } catch (err) {
      console.error(
        `[cron/calendar-sync] Re-engagement email failed for lead ${lead.id}:`,
        err
      )
    }
  }

  if (failed > 0) {
    try {
      await sendAdminAlert(
        `Calendar sync cron: ${failed} failure${failed !== 1 ? 's' : ''}`,
        `Calendar sync cron completed with failures.\n\nChecked: ${bookings.length}\nCancelled: ${cancelled}\nFailed: ${failed}\nRe-engagement sent: ${reengagementSent}\n\nCheck server logs for details.`
      )
    } catch (alertErr) {
      console.error('[cron/calendar-sync] Failed to send admin alert:', alertErr)
    }
  }

  return NextResponse.json({
    success: true,
    checked: bookings.length,
    cancelled,
    failed,
    reengagement_sent: reengagementSent,
    message: `Calendar sync complete: ${cancelled} cancelled, ${reengagementSent} re-engagement emails sent`,
  })
}
