import { google } from 'googleapis'
import { AvailabilityHours, DEFAULT_AVAILABILITY } from '@/lib/supabase'

// ============================================================
// Types
// ============================================================

export interface TimeSlot {
  start: string  // ISO 8601
  end: string    // ISO 8601
}

// ============================================================
// Timezone helpers
// ============================================================

// Given a UTC epoch (ms), return the YYYY-MM-DD string and day-of-week (0=Sun)
// as they appear in the given IANA timezone.
function getLocalDateInfo(ms: number, tz: string): { dateStr: string; dayOfWeek: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short',
  }).formatToParts(new Date(ms))
  const p: Record<string, string> = {}
  for (const part of parts) if (part.type !== 'literal') p[part.type] = part.value
  const dow = ({ Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 } as Record<string, number>)[p.weekday] ?? 0
  return { dateStr: `${p.year}-${p.month}-${p.day}`, dayOfWeek: dow }
}

// Convert a local YYYY-MM-DD date and hour to UTC milliseconds.
// Handles DST correctly for any IANA timezone including half-hour offsets.
function localHourToUtcMs(dateStr: string, hour: number, tz: string): number {
  // Treat the desired local time as UTC first, then measure the offset
  const candidate = new Date(`${dateStr}T${String(hour).padStart(2, '0')}:00:00Z`)
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour: '2-digit', minute: '2-digit',
    hour12: false,
  }).formatToParts(candidate)
  const p: Record<string, string> = {}
  for (const part of parts) if (part.type !== 'literal') p[part.type] = part.value
  const localH = parseInt(p.hour) % 24
  const localM = parseInt(p.minute)
  const diffMs = ((localH * 60 + localM) - hour * 60) * 60 * 1000
  return candidate.getTime() - diffMs
}

// ============================================================
// OAuth2 client factory (server-only)
// ============================================================

/**
 * Returns true only when all required Google Calendar env vars are present.
 * Use this as a guard before any calendar operation — never let missing
 * credentials throw an unhandled error into the request lifecycle.
 */
export function isCalendarConfigured(): boolean {
  return !!(
    process.env.GOOGLE_CLIENT_ID &&
    process.env.GOOGLE_CLIENT_SECRET &&
    process.env.GOOGLE_REFRESH_TOKEN
  )
}

function getOAuth2Client() {
  if (!isCalendarConfigured()) {
    throw new Error(
      'Google Calendar is not configured — set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REFRESH_TOKEN'
    )
  }

  const auth = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  )
  auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN })
  return auth
}

// ============================================================
// getAvailableSlots
// Returns available 1-hour slots during business hours for the
// next `daysAhead` days, excluding times already booked.
// ============================================================

export async function getAvailableSlots(
  calendarId: string,
  daysAhead = 14,
  availabilityHours?: AvailabilityHours | null
): Promise<TimeSlot[]> {
  if (!isCalendarConfigured()) return []  // graceful no-op when unconfigured

  const avail = availabilityHours ?? DEFAULT_AVAILABILITY

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

  // Generate 1-hour slots using the client's local availability hours + timezone
  const slots: TimeSlot[] = []
  const cursor = new Date(timeMin)
  cursor.setUTCHours(0, 0, 0, 0)

  while (cursor < timeMax) {
    const { dateStr, dayOfWeek } = getLocalDateInfo(cursor.getTime(), avail.timezone)

    if (avail.days.includes(dayOfWeek)) {
      for (let hour = avail.start_hour; hour < avail.end_hour; hour++) {
        const startMs = localHourToUtcMs(dateStr, hour, avail.timezone)
        const endMs   = localHourToUtcMs(dateStr, hour + 1, avail.timezone)

        if (startMs <= now.getTime()) continue
        if (startMs >= timeMax.getTime()) continue

        const isAvailable = !busy.some((b) => startMs < b.end && endMs > b.start)
        if (isAvailable) {
          slots.push({ start: new Date(startMs).toISOString(), end: new Date(endMs).toISOString() })
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
