import { google } from 'googleapis'

// ============================================================
// Types
// ============================================================

export interface TimeSlot {
  start: string  // ISO 8601
  end: string    // ISO 8601
}

// ============================================================
// OAuth2 client factory (server-only)
// ============================================================

function getOAuth2Client() {
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  const redirectUri = process.env.GOOGLE_REDIRECT_URI
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error(
      'Missing Google Calendar env vars: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN'
    )
  }

  const auth = new google.auth.OAuth2(clientId, clientSecret, redirectUri)
  auth.setCredentials({ refresh_token: refreshToken })
  return auth
}

// ============================================================
// getAvailableSlots
// Returns available 1-hour slots during business hours for the
// next `daysAhead` days, excluding times already booked.
// ============================================================

export async function getAvailableSlots(
  calendarId: string,
  daysAhead = 14
): Promise<TimeSlot[]> {
  const auth = getOAuth2Client()
  const calendar = google.calendar({ version: 'v3', auth })

  const now = new Date()

  const timeMin = new Date(now)
  // Start from the next full hour
  timeMin.setMinutes(0, 0, 0)
  timeMin.setHours(timeMin.getHours() + 1)

  const timeMax = new Date(timeMin)
  timeMax.setDate(timeMax.getDate() + daysAhead)

  // Fetch busy intervals from the calendar
  const { data } = await calendar.freebusy.query({
    requestBody: {
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      items: [{ id: calendarId }],
      timeZone: 'UTC',
    },
  })

  const busy = (data.calendars?.[calendarId]?.busy ?? []).map((b) => ({
    start: new Date(b.start!).getTime(),
    end: new Date(b.end!).getTime(),
  }))

  // Generate 1-hour slots during business hours (9am–5pm UTC), Mon–Fri
  const slots: TimeSlot[] = []
  const cursor = new Date(timeMin)
  cursor.setUTCHours(0, 0, 0, 0)

  while (cursor < timeMax) {
    const dayOfWeek = cursor.getUTCDay()
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6

    if (!isWeekend) {
      for (let hour = 9; hour < 17; hour++) {
        const start = new Date(cursor)
        start.setUTCHours(hour, 0, 0, 0)
        const end = new Date(start)
        end.setUTCHours(hour + 1, 0, 0, 0)

        // Skip past slots
        if (start.getTime() <= now.getTime()) continue

        // Skip if outside our window
        if (start >= timeMax) continue

        // Skip if overlaps with any busy interval
        const startMs = start.getTime()
        const endMs = end.getTime()
        const isAvailable = !busy.some((b) => startMs < b.end && endMs > b.start)

        if (isAvailable) {
          slots.push({ start: start.toISOString(), end: end.toISOString() })
        }
      }
    }

    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }

  return slots
}

// ============================================================
// createBooking
// Creates a Google Calendar event and returns the event ID.
// ============================================================

export async function createBooking(
  calendarId: string,
  slot: TimeSlot,
  leadName: string,
  leadEmail: string,
  clientEmail: string
): Promise<string> {
  const auth = getOAuth2Client()
  const calendar = google.calendar({ version: 'v3', auth })

  const { data: event } = await calendar.events.insert({
    calendarId,
    sendUpdates: 'all',  // Send email invites to attendees
    requestBody: {
      summary: `Appointment: ${leadName}`,
      description: 'Booked via reactivation campaign.',
      start: { dateTime: slot.start, timeZone: 'UTC' },
      end: { dateTime: slot.end, timeZone: 'UTC' },
      attendees: [
        { email: leadEmail, displayName: leadName },
        { email: clientEmail, responseStatus: 'accepted' },
      ],
      status: 'confirmed',
      guestsCanSeeOtherGuests: false,
    },
  })

  if (!event.id) throw new Error('Google Calendar returned no event ID')
  return event.id
}

// ============================================================
// checkBookingStatus
// Returns 'confirmed', 'cancelled', or null (event not found).
// Used by the calendar-sync cron (Phase 15).
// ============================================================

export async function checkBookingStatus(
  calendarId: string,
  eventId: string
): Promise<'confirmed' | 'cancelled' | null> {
  const auth = getOAuth2Client()
  const calendar = google.calendar({ version: 'v3', auth })

  try {
    const { data } = await calendar.events.get({ calendarId, eventId })
    if (data.status === 'cancelled') return 'cancelled'
    return 'confirmed'
  } catch (err: unknown) {
    const status = (err as { code?: number; status?: number })?.code ??
      (err as { code?: number; status?: number })?.status
    if (status === 404 || status === 410) return null
    throw err
  }
}
