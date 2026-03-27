import { NextResponse } from 'next/server'
import { getAdminUserId } from '@/lib/auth'
import { isCalendarConfigured } from '@/lib/calendar'
import { isTwilioConfigured } from '@/lib/twilio'
import { google } from 'googleapis'

export interface HealthStatus {
  calendar: { configured: boolean; working: boolean; error?: string }
  twilio:   { configured: boolean }
  email:    { configured: boolean }
}

export async function GET() {
  try {
    const adminUserId = await getAdminUserId()
    if (!adminUserId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const calendarConfigured = isCalendarConfigured()
    let calendarWorking = false
    let calendarError: string | undefined

    if (calendarConfigured) {
      try {
        const auth = new google.auth.OAuth2(
          process.env.GOOGLE_CLIENT_ID,
          process.env.GOOGLE_CLIENT_SECRET,
          process.env.GOOGLE_REDIRECT_URI
        )
        auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN })
        const calendar = google.calendar({ version: 'v3', auth })
        await calendar.calendarList.list({ maxResults: 1 })
        calendarWorking = true
      } catch (err) {
        calendarError = err instanceof Error ? err.message : String(err)
      }
    }

    const status: HealthStatus = {
      calendar: { configured: calendarConfigured, working: calendarWorking, error: calendarError },
      twilio:   { configured: isTwilioConfigured() },
      email:    { configured: !!(process.env.RESEND_API_KEY) },
    }

    return NextResponse.json(status)
  } catch (err) {
    console.error('[admin/health]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
