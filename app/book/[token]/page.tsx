import { getSupabaseClient } from '@/lib/supabase'
import { getAvailableSlots, TimeSlot } from '@/lib/calendar'
import { BookingForm } from '@/components/booking/BookingForm'
import { Zap, AlertCircle } from 'lucide-react'

interface Props {
  params: Promise<{ token: string }>
}

export default async function BookingPage({ params }: Props) {
  const { token } = await params
  const supabase = getSupabaseClient()

  // Fetch lead + campaign + client by booking_token
  const { data: lead } = await supabase
    .from('leads')
    .select('id, name, status, campaign_id, client_id, clients(name, email, google_calendar_id, business_name)')
    .eq('booking_token', token)
    .single()

  // Invalid token — show error
  if (!lead) {
    return <BookingLayout><ErrorState message="This booking link is invalid or has expired." /></BookingLayout>
  }

  // Lead already booked — show message
  if (lead.status === 'booked' || lead.status === 'completed') {
    return (
      <BookingLayout>
        <ErrorState message="You already have an appointment booked. Check your confirmation email for details." />
      </BookingLayout>
    )
  }

  // Lead deleted or unsubscribed
  if (lead.status === 'deleted' || lead.status === 'unsubscribed') {
    return <BookingLayout><ErrorState message="This booking link is no longer active." /></BookingLayout>
  }

  const clientData = lead.clients as unknown as {
    name: string
    email: string
    google_calendar_id: string | null
    business_name: string | null
  } | null

  const clientDisplayName = clientData?.business_name || clientData?.name || 'the business'

  // Record the "clicked" event (visiting the booking page)
  // Only update if status isn't already past "clicked"
  if (!['booked', 'completed', 'clicked'].includes(lead.status ?? '')) {
    await supabase
      .from('leads')
      .update({ status: 'clicked' })
      .eq('id', lead.id)

    await supabase.from('lead_events').insert({
      lead_id: lead.id,
      event_type: 'clicked',
      description: 'Lead visited booking page',
    })
  }

  // Fetch available slots from Google Calendar
  let slots: TimeSlot[] = []
  let calendarError = false

  let calendarErrorMessage = ''
  if (clientData?.google_calendar_id) {
    try {
      slots = await getAvailableSlots(clientData.google_calendar_id)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error('[book/page] Failed to fetch calendar slots:', message)
      calendarError = true
      calendarErrorMessage = message
    }
  }

  return (
    <BookingLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold text-foreground">
            Book your appointment
          </h1>
          <p className="text-sm text-muted-foreground">
            with <span className="font-medium text-foreground">{clientDisplayName}</span>
          </p>
        </div>

        {/* Calendar error fallback */}
        {calendarError && (
          <div className="flex items-start gap-3 p-4 rounded-lg border border-amber-500/20 bg-amber-500/5">
            <AlertCircle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">
                Calendar is temporarily unavailable. Please contact{' '}
                <span className="font-medium text-foreground">{clientDisplayName}</span> directly to book
                your appointment.
              </p>
              {calendarErrorMessage && (
                <p className="text-xs font-mono text-amber-700 dark:text-amber-400 break-all">
                  {calendarErrorMessage}
                </p>
              )}
            </div>
          </div>
        )}

        {/* No calendar configured */}
        {!clientData?.google_calendar_id && !calendarError && (
          <div className="flex items-start gap-3 p-4 rounded-lg border border-border bg-muted/20">
            <AlertCircle className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
            <p className="text-sm text-muted-foreground">
              Online booking is not yet set up for {clientDisplayName}. Please reply to the email you
              received to arrange an appointment.
            </p>
          </div>
        )}

        {/* Booking form */}
        {clientData?.google_calendar_id && !calendarError && (
          <BookingForm
            token={token}
            leadName={lead.name}
            clientName={clientDisplayName}
            slots={slots}
          />
        )}
      </div>
    </BookingLayout>
  )
}

// ── Layout wrapper ────────────────────────────────────────────
function BookingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-lg mx-auto px-4 py-12 space-y-8">
        {/* Brand */}
        <div className="flex items-center gap-2 text-muted-foreground/50">
          <Zap className="w-4 h-4" />
          <span className="text-sm font-medium">Reactivate</span>
        </div>

        {/* Content */}
        <div className="rounded-xl border border-border bg-card p-6">{children}</div>

        {/* Footer */}
        <p className="text-center text-xs text-muted-foreground/50">
          <a href="/privacy" className="hover:text-muted-foreground transition-colors">
            Privacy policy
          </a>
        </p>
      </div>
    </div>
  )
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center gap-4 py-6 text-center">
      <AlertCircle className="w-8 h-8 text-muted-foreground/40" />
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  )
}
