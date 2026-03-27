import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSupabaseClient } from '@/lib/supabase'
import { createBooking, isCalendarConfigured } from '@/lib/calendar'
import { sendBookingConfirmation, sendClientBookingNotification } from '@/lib/email'

const bookingSchema = z.object({
  name: z.string().min(1, 'Name is required').max(200),
  email: z.string().email('Invalid email address'),
  slot_start: z.string().datetime('Invalid slot start time'),
  slot_end: z.string().datetime('Invalid slot end time'),
})

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // `id` here is the lead's booking_token (public UUID from the email/SMS link)
    const { id: token } = await params

    // 1. Validate input
    const body = await req.json()
    const parsed = bookingSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid input' },
        { status: 400 }
      )
    }

    const { name, email, slot_start, slot_end } = parsed.data

    const supabase = getSupabaseClient()

    // 2. Fetch lead by booking_token — validate token
    const { data: lead } = await supabase
      .from('leads')
      .select('id, name, status, campaign_id, client_id, booking_token')
      .eq('booking_token', token)
      .single()

    if (!lead) {
      return NextResponse.json({ error: 'Invalid booking link' }, { status: 404 })
    }

    // Prevent double-booking
    if (lead.status === 'booked' || lead.status === 'completed') {
      return NextResponse.json(
        { error: 'You already have an appointment booked.' },
        { status: 409 }
      )
    }

    if (lead.status === 'deleted' || lead.status === 'unsubscribed') {
      return NextResponse.json({ error: 'This booking link is no longer active.' }, { status: 403 })
    }

    // 3. Fetch campaign + client details
    const { data: campaign } = await supabase
      .from('campaigns')
      .select('send_booking_confirmation, notify_client')
      .eq('id', lead.campaign_id)
      .single()

    const { data: client } = await supabase
      .from('clients')
      .select('name, email, google_calendar_id, business_name')
      .eq('id', lead.client_id)
      .single()

    if (!client) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 })
    }

    // 4. Create Google Calendar event (skipped gracefully if not configured)
    let googleEventId: string | null = null
    if (client.google_calendar_id && isCalendarConfigured()) {
      try {
        googleEventId = await createBooking(
          client.google_calendar_id,
          { start: slot_start, end: slot_end },
          name,
          email,
          client.email
        )
      } catch (err) {
        // Non-fatal — log and continue without calendar event
        console.error('[leads/book] Google Calendar event creation failed:', err)
      }
    }

    // 5. Insert booking record
    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .insert({
        lead_id: lead.id,
        client_id: lead.client_id,
        scheduled_at: slot_start,
        google_event_id: googleEventId,
        status: 'booked',
        commission_owed: 0,
      })
      .select()
      .single()

    if (bookingError || !booking) {
      console.error('[leads/book] Booking insert failed:', bookingError?.message)
      return NextResponse.json({ error: 'Failed to save booking.' }, { status: 500 })
    }

    // 6. Update lead status to "booked"
    await supabase.from('leads').update({ status: 'booked' }).eq('id', lead.id)

    // 7. Log event
    await supabase.from('lead_events').insert({
      lead_id: lead.id,
      event_type: 'booked',
      description: `Booked appointment for ${new Date(slot_start).toISOString()}`,
    })

    // 8. Send booking confirmation to lead
    if (campaign?.send_booking_confirmation) {
      try {
        await sendBookingConfirmation({
          to: email,
          replyTo: client.email,
          clientName: client.business_name || client.name,
          clientBusinessName: client.business_name || undefined,
          scheduledAt: slot_start,
          leadToken: lead.booking_token,
        })
      } catch (err) {
        console.error('[leads/book] Confirmation email failed:', err)
      }
    }

    // 9. Notify client of new booking
    if (campaign?.notify_client) {
      try {
        const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/$/, '')
        await sendClientBookingNotification({
          to: client.email,
          leadName: name,
          scheduledAt: slot_start,
          dashboardUrl: `${appUrl}/dashboard`,
        })
      } catch (err) {
        console.error('[leads/book] Client notification failed:', err)
      }
    }

    return NextResponse.json({ success: true, booking_id: booking.id })
  } catch (err) {
    console.error('[leads/book] Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
