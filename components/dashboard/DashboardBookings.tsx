'use client'

import { useState } from 'react'
import { format, parseISO } from 'date-fns'
import { toast } from 'sonner'
import { Booking } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { CheckCircle, AlertCircle, Loader2, Calendar } from 'lucide-react'
import { cn } from '@/lib/utils'

const STATUS_BADGE: Record<string, { label: string; classes: string }> = {
  booked: { label: 'Upcoming', classes: 'bg-blue-500/10 text-blue-600 dark:text-blue-400' },
  completed: { label: 'Completed', classes: 'bg-green-500/10 text-green-600 dark:text-green-400' },
  cancelled: { label: 'Cancelled', classes: 'bg-muted text-muted-foreground' },
  disputed: { label: 'Disputed', classes: 'bg-amber-500/10 text-amber-600 dark:text-amber-400' },
}

const RESOLVED_BADGE = { label: 'Resolved', classes: 'bg-green-500/10 text-green-600 dark:text-green-400' }

interface DashboardBookingsProps {
  bookings: (Booking & { leadName: string })[]
  openDisputeBookingIds: Set<string>
}

export function DashboardBookings({ bookings: initialBookings, openDisputeBookingIds }: DashboardBookingsProps) {
  const [bookings, setBookings] = useState(initialBookings)
  const [completing, setCompleting] = useState<string | null>(null)
  const [disputeTarget, setDisputeTarget] = useState<string | null>(null)
  const [disputeReason, setDisputeReason] = useState('')
  const [disputing, setDisputing] = useState(false)

  async function handleComplete(bookingId: string) {
    setCompleting(bookingId)
    try {
      const res = await fetch('/api/jobs/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId, completedBy: 'client' }),
      })
      const json = await res.json()
      if (!res.ok) {
        toast.error(json.error ?? 'Failed to mark complete')
        return
      }
      toast.success('Job marked as complete')
      setBookings((prev) =>
        prev.map((b) => (b.id === bookingId ? { ...b, status: 'completed' } : b))
      )
    } catch {
      toast.error('Something went wrong')
    } finally {
      setCompleting(null)
    }
  }

  async function handleDispute() {
    if (!disputeTarget || !disputeReason.trim()) return
    setDisputing(true)
    try {
      const res = await fetch(`/api/bookings/${disputeTarget}/dispute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: disputeReason.trim() }),
      })
      const json = await res.json()
      if (!res.ok) {
        toast.error(json.error ?? 'Failed to raise dispute')
        return
      }
      toast.success('Dispute raised — our team will review it')
      setBookings((prev) =>
        prev.map((b) => (b.id === disputeTarget ? { ...b, status: 'disputed' } : b))
      )
      setDisputeTarget(null)
      setDisputeReason('')
    } catch {
      toast.error('Something went wrong')
    } finally {
      setDisputing(false)
    }
  }

  if (bookings.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 border border-dashed border-border rounded-lg text-center">
        <Calendar className="w-7 h-7 text-muted-foreground/30 mb-2" />
        <p className="text-sm text-muted-foreground">No bookings yet</p>
      </div>
    )
  }

  return (
    <>
      <div className="rounded-lg border border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30">
              <TableHead className="font-medium">Lead</TableHead>
              <TableHead className="font-medium">Date &amp; time</TableHead>
              <TableHead className="font-medium">Status</TableHead>
              <TableHead className="w-48 font-medium">Manage</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {bookings.map((booking) => {
              const isOpenDispute = openDisputeBookingIds.has(booking.id)
              const badge =
                booking.status === 'disputed' && !isOpenDispute
                  ? RESOLVED_BADGE
                  : (STATUS_BADGE[booking.status] ?? { label: booking.status, classes: 'bg-muted text-muted-foreground' })
              const isCompleting = completing === booking.id

              return (
                <TableRow key={booking.id} className="hover:bg-muted/10">
                  <TableCell className="font-medium text-foreground">
                    {booking.leadName}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {format(parseISO(booking.scheduled_at), 'EEE d MMM yyyy, h:mm a')}
                  </TableCell>
                  <TableCell>
                    <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium', badge.classes)}>
                      {badge.label}
                    </span>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {booking.status === 'booked' && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleComplete(booking.id)}
                          disabled={isCompleting}
                        >
                          {isCompleting ? (
                            <Loader2 className="w-3 h-3 mr-1.5 animate-spin" />
                          ) : (
                            <CheckCircle className="w-3 h-3 mr-1.5" />
                          )}
                          Mark complete
                        </Button>
                      )}
                      {(booking.status === 'completed' || booking.status === 'disputed') && !isOpenDispute && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-muted-foreground text-xs"
                          onClick={() => {
                            setDisputeTarget(booking.id)
                            setDisputeReason('')
                          }}
                        >
                          <AlertCircle className="w-3 h-3 mr-1.5" />
                          Raise dispute
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>

      {/* Dispute dialog */}
      <Dialog open={disputeTarget !== null} onOpenChange={(open) => !open && setDisputeTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Raise a commission dispute</DialogTitle>
            <DialogDescription>
              Please explain why you are disputing this commission charge. Our team will review it within 2 business days.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="dispute-reason">Reason</Label>
            <Textarea
              id="dispute-reason"
              value={disputeReason}
              onChange={(e) => setDisputeReason(e.target.value)}
              placeholder="e.g. The job was cancelled before it started…"
              rows={4}
              disabled={disputing}
              className="resize-none"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDisputeTarget(null)} disabled={disputing}>
              Cancel
            </Button>
            <Button
              onClick={handleDispute}
              disabled={disputing || disputeReason.trim().length < 10}
            >
              {disputing && <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />}
              Submit dispute
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
