import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseClient } from '@/lib/supabase'
import { sendBookingReminder } from '@/lib/gmail'

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
  const reminderHours = parseInt(process.env.REMINDER_HOURS_BEFORE ?? '24', 10)

  // Find bookings that:
  // 1. Are still "booked" (not cancelled or completed)
  // 2. Are scheduled within the next REMINDER_HOURS_BEFORE hours
  // 3. Haven't had a reminder sent yet (reminder_sent_at IS NULL)
  const now = new Date()
  const windowEnd = new Date(now.getTime() + reminderHours * 60 * 60 * 1000)

  const { data: bookings, error } = await supabase
    .from('bookings')
    .select(`
      id,
      lead_id,
      client_id,
      scheduled_at,
      reminder_sent_at,
      leads!inner(id, name, email, booking_token, email_opt_out, status, campaign_id),
      clients!inner(name, email, business_name, business_address)
    `)
    .eq('status', 'booked')
    .is('reminder_sent_at', null)
    .gte('scheduled_at', now.toISOString())
    .lte('scheduled_at', windowEnd.toISOString())

  if (error) {
    console.error('[cron/reminders] Failed to fetch bookings:', error.message)
    return NextResponse.json({ error: 'Failed to fetch bookings' }, { status: 500 })
  }

  if (!bookings || bookings.length === 0) {
    return NextResponse.json({ message: 'No reminders to send', sent: 0 })
  }

  let sent = 0
  let failed = 0

  for (const booking of bookings) {
    const lead = booking.leads as unknown as {
      id: string
      name: string
      email: string | null
      booking_token: string
      email_opt_out: boolean
      status: string
      campaign_id: string
    }
    const client = booking.clients as unknown as {
      name: string
      email: string
      business_name: string | null
      business_address: string | null
    }

    // Skip if lead has opted out or is deleted/unsubscribed
    if (lead.email_opt_out || !lead.email) continue
    if (lead.status === 'deleted' || lead.status === 'unsubscribed') continue

    // Check campaign.send_booking_reminder toggle
    const { data: campaign } = await supabase
      .from('campaigns')
      .select('send_booking_reminder')
      .eq('id', lead.campaign_id)
      .single()

    if (!campaign?.send_booking_reminder) continue

    const clientName = client.business_name || client.name

    try {
      await sendBookingReminder({
        to: lead.email,
        replyTo: client.email,
        clientName,
        scheduledAt: booking.scheduled_at,
        leadToken: lead.booking_token,
      })

      // Mark reminder as sent — prevents duplicate sends
      await supabase
        .from('bookings')
        .update({ reminder_sent_at: new Date().toISOString() })
        .eq('id', booking.id)

      sent++
    } catch (err) {
      console.error(`[cron/reminders] Failed to send reminder for booking ${booking.id}:`, err)
      failed++
    }
  }

  return NextResponse.json({
    success: true,
    sent,
    failed,
    message: `Reminders cron complete: ${sent} sent, ${failed} failed`,
  })
}
