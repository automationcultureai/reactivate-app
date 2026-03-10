'use client'

import { useState, useMemo } from 'react'
import { format, parseISO } from 'date-fns'
import { toast } from 'sonner'
import { TimeSlot } from '@/lib/calendar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { CheckCircle, Calendar, Clock, Loader2, ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

interface BookingFormProps {
  token: string
  leadName: string
  clientName: string
  slots: TimeSlot[]
}

type Step = 'pick-date' | 'pick-time' | 'confirm' | 'success'

export function BookingForm({ token, leadName, clientName, slots }: BookingFormProps) {
  const [step, setStep] = useState<Step>('pick-date')
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [selectedSlot, setSelectedSlot] = useState<TimeSlot | null>(null)
  const [name, setName] = useState(leadName)
  const [email, setEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // Group slots by date string (YYYY-MM-DD)
  const slotsByDate = useMemo(() => {
    const map = new Map<string, TimeSlot[]>()
    for (const slot of slots) {
      const dateKey = format(parseISO(slot.start), 'yyyy-MM-dd')
      if (!map.has(dateKey)) map.set(dateKey, [])
      map.get(dateKey)!.push(slot)
    }
    return map
  }, [slots])

  const availableDates = Array.from(slotsByDate.keys()).sort()
  const timeSlotsForDate = selectedDate ? (slotsByDate.get(selectedDate) ?? []) : []

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedSlot || !name.trim() || !email.trim()) return

    setSubmitting(true)
    try {
      const res = await fetch(`/api/leads/${token}/book`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          slot_start: selectedSlot.start,
          slot_end: selectedSlot.end,
        }),
      })
      const json = await res.json()
      if (!res.ok) {
        toast.error(json.error ?? 'Booking failed — please try again')
        return
      }
      setStep('success')
    } catch {
      toast.error('Something went wrong. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  // ── Success state ──────────────────────────────────────
  if (step === 'success' && selectedSlot) {
    return (
      <div className="flex flex-col items-center gap-6 py-8 text-center">
        <div className="flex items-center justify-center w-16 h-16 rounded-full bg-green-500/10">
          <CheckCircle className="w-8 h-8 text-green-500" />
        </div>
        <div className="space-y-2">
          <h2 className="text-xl font-semibold text-foreground">Booking confirmed!</h2>
          <p className="text-muted-foreground text-sm">
            Your appointment with <span className="font-medium text-foreground">{clientName}</span>{' '}
            is booked for:
          </p>
          <p className="text-lg font-semibold text-foreground">
            {format(parseISO(selectedSlot.start), 'EEEE, d MMMM yyyy')}
          </p>
          <p className="text-foreground">
            {format(parseISO(selectedSlot.start), 'h:mm a')} –{' '}
            {format(parseISO(selectedSlot.end), 'h:mm a')}
          </p>
        </div>
        <p className="text-xs text-muted-foreground max-w-xs">
          A confirmation has been sent to your email. If you need to reschedule, please reply to
          that email.
        </p>
      </div>
    )
  }

  // ── No slots available ──────────────────────────────────
  if (slots.length === 0) {
    return (
      <div className="text-center py-8 space-y-3">
        <Calendar className="w-8 h-8 text-muted-foreground/40 mx-auto" />
        <p className="text-sm font-medium text-foreground">No available slots</p>
        <p className="text-xs text-muted-foreground">
          Please contact {clientName} directly to schedule an appointment.
        </p>
      </div>
    )
  }

  // ── Pick date ──────────────────────────────────────────
  if (step === 'pick-date') {
    return (
      <div className="space-y-4">
        <div>
          <p className="text-sm font-medium text-foreground">Select a date</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Available appointments with {clientName}
          </p>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {availableDates.map((date) => {
            const parsed = parseISO(date)
            return (
              <button
                key={date}
                type="button"
                onClick={() => {
                  setSelectedDate(date)
                  setStep('pick-time')
                }}
                className={cn(
                  'flex flex-col items-center gap-1 p-4 rounded-lg border transition-colors text-center',
                  'border-border hover:border-primary hover:bg-primary/5'
                )}
              >
                <span className="text-xs text-muted-foreground">
                  {format(parsed, 'EEE')}
                </span>
                <span className="text-lg font-semibold text-foreground leading-none">
                  {format(parsed, 'd')}
                </span>
                <span className="text-xs text-muted-foreground">
                  {format(parsed, 'MMM')}
                </span>
                <span className="text-xs text-primary font-medium">
                  {slotsByDate.get(date)?.length} slot{slotsByDate.get(date)?.length !== 1 ? 's' : ''}
                </span>
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  // ── Pick time ──────────────────────────────────────────
  if (step === 'pick-time' && selectedDate) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => { setSelectedDate(null); setStep('pick-date') }}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <div>
            <p className="text-sm font-medium text-foreground">
              {format(parseISO(selectedDate), 'EEEE, d MMMM yyyy')}
            </p>
            <p className="text-xs text-muted-foreground">Select a time slot</p>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {timeSlotsForDate.map((slot) => (
            <button
              key={slot.start}
              type="button"
              onClick={() => {
                setSelectedSlot(slot)
                setStep('confirm')
              }}
              className="flex items-center justify-center gap-2 p-3 rounded-lg border border-border hover:border-primary hover:bg-primary/5 transition-colors"
            >
              <Clock className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-sm text-foreground font-medium">
                {format(parseISO(slot.start), 'h:mm a')}
              </span>
            </button>
          ))}
        </div>
      </div>
    )
  }

  // ── Confirm booking ──────────────────────────────────────
  if (step === 'confirm' && selectedSlot) {
    return (
      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Selected slot summary */}
        <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-1">
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <Calendar className="w-4 h-4 text-muted-foreground" />
            {format(parseISO(selectedSlot.start), 'EEEE, d MMMM yyyy')}
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Clock className="w-4 h-4" />
            {format(parseISO(selectedSlot.start), 'h:mm a')} –{' '}
            {format(parseISO(selectedSlot.end), 'h:mm a')}
          </div>
          <button
            type="button"
            onClick={() => setStep('pick-time')}
            className="text-xs text-primary hover:underline mt-1 flex items-center gap-1"
          >
            <ChevronLeft className="w-3 h-3" />
            Change time
          </button>
        </div>

        <Separator />

        <div className="space-y-4">
          <p className="text-sm font-medium text-foreground">Confirm your details</p>

          <div className="space-y-1.5">
            <Label htmlFor="b-name">Your name</Label>
            <Input
              id="b-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your full name"
              required
              disabled={submitting}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="b-email">Email address</Label>
            <Input
              id="b-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              disabled={submitting}
            />
            <p className="text-xs text-muted-foreground">
              We&apos;ll send your booking confirmation here.
            </p>
          </div>
        </div>

        <Button
          type="submit"
          className="w-full"
          disabled={submitting || !name.trim() || !email.trim()}
        >
          {submitting ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <ChevronRight className="w-4 h-4 mr-2" />
          )}
          {submitting ? 'Booking…' : 'Confirm booking'}
        </Button>
      </form>
    )
  }

  return null
}
