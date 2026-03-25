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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { AlertCircle, Loader2, Calendar, Paperclip } from 'lucide-react'
import { cn } from '@/lib/utils'

const STATUS_BADGE: Record<string, { label: string; classes: string }> = {
  booked: { label: 'Upcoming', classes: 'bg-blue-500/10 text-blue-600 dark:text-blue-400' },
  completed: { label: 'Completed', classes: 'bg-green-500/10 text-green-600 dark:text-green-400' },
  cancelled: { label: 'Cancelled', classes: 'bg-muted text-muted-foreground' },
  disputed: { label: 'Disputed', classes: 'bg-amber-500/10 text-amber-600 dark:text-amber-400' },
}

interface DashboardBookingsProps {
  bookings: (Booking & { leadName: string })[]
  disputesByBooking: Record<string, { status: string; admin_notes: string | null; reason: string }>
  commissionType: 'flat' | 'percentage'
  commissionValue: number  // cents (flat) or basis points (percentage)
}

export function DashboardBookings({ bookings: initialBookings, disputesByBooking, commissionType, commissionValue }: DashboardBookingsProps) {
  const [bookings, setBookings] = useState(initialBookings)
  const [working, setWorking] = useState<string | null>(null)
  // Per-booking selected action — default "complete"
  const [bookingActions, setBookingActions] = useState<Record<string, 'complete' | 'cancel'>>({})
  const [disputeTarget, setDisputeTarget] = useState<string | null>(null)
  const [disputeReason, setDisputeReason] = useState('')
  const [disputing, setDisputing] = useState(false)
  const [raisedDisputeIds, setRaisedDisputeIds] = useState<Set<string>>(new Set())
  const [completeTarget, setCompleteTarget] = useState<string | null>(null)
  const [jobValueInput, setJobValueInput] = useState('')
  const [receiptFile, setReceiptFile] = useState<File | null>(null)

  function getAction(bookingId: string): 'complete' | 'cancel' {
    return bookingActions[bookingId] ?? 'complete'
  }

  function handleApply(bookingId: string) {
    const action = getAction(bookingId)
    if (action === 'complete') {
      setCompleteTarget(bookingId)
      setJobValueInput('')
      setReceiptFile(null)
    } else {
      handleCancel(bookingId)
    }
  }

  const jobValueValid =
    jobValueInput.trim() !== '' &&
    !isNaN(parseFloat(jobValueInput)) &&
    parseFloat(jobValueInput) > 0

  function calcPreviewCommission(): string {
    if (commissionType === 'flat') {
      return `$${(commissionValue / 100).toFixed(2)}`
    }
    if (jobValueValid) {
      const amount = Math.round(parseFloat(jobValueInput) * 100 * commissionValue / 10000) / 100
      return `$${amount.toFixed(2)} (${commissionValue / 100}% of $${parseFloat(jobValueInput).toFixed(2)})`
    }
    return `${commissionValue / 100}% of job value`
  }

  async function handleComplete(bookingId: string, jobValueStr: string) {
    setCompleteTarget(null)
    setWorking(bookingId)
    try {
      let receipt_url: string | undefined

      if (receiptFile) {
        const fd = new FormData()
        fd.append('file', receiptFile)
        const uploadRes = await fetch(`/api/bookings/${bookingId}/upload-receipt`, {
          method: 'POST',
          body: fd,
        })
        if (uploadRes.ok) {
          const uploadJson = await uploadRes.json()
          receipt_url = uploadJson.receipt_url
        }
        // non-fatal — proceed even if upload fails
      }

      const body: Record<string, unknown> = {
        bookingId,
        completedBy: 'client',
        job_value: parseFloat(jobValueStr),
      }
      if (receipt_url) body.receipt_url = receipt_url

      const res = await fetch('/api/jobs/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!res.ok) {
        toast.error(json.error ?? 'Failed to mark complete')
        return
      }
      toast.success('Job marked as complete')

      // Calculate commission for optimistic UI update
      const job_value_cents = Math.round(parseFloat(jobValueStr) * 100)
      const commission_amount = commissionType === 'flat'
        ? commissionValue
        : Math.round(job_value_cents * commissionValue / 10000)

      setBookings((prev) =>
        prev.map((b) =>
          b.id === bookingId
            ? { ...b, status: 'completed', job_value: job_value_cents, commission_amount, receipt_url: receipt_url ?? b.receipt_url }
            : b
        )
      )
    } catch {
      toast.error('Something went wrong')
    } finally {
      setWorking(null)
    }
  }

  async function handleCancel(bookingId: string) {
    setWorking(bookingId)
    try {
      const res = await fetch(`/api/bookings/${bookingId}/cancel`, { method: 'POST' })
      const json = await res.json()
      if (!res.ok) {
        toast.error(json.error ?? 'Failed to cancel booking')
        return
      }
      toast.success('Booking marked as cancelled')
      setBookings((prev) =>
        prev.map((b) => (b.id === bookingId ? { ...b, status: 'cancelled' } : b))
      )
    } catch {
      toast.error('Something went wrong')
    } finally {
      setWorking(null)
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
      setRaisedDisputeIds(prev => new Set([...prev, disputeTarget!]))
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
              <TableHead className="font-medium">Job value</TableHead>
              <TableHead className="font-medium">Fee owed</TableHead>
              <TableHead className="w-56 font-medium">Manage</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {bookings.map((booking) => {
              const dispute = disputesByBooking[booking.id]
              const wasJustRaised = raisedDisputeIds.has(booking.id)
              const isWorking = working === booking.id
              const isCompleted = booking.status === 'completed' || booking.status === 'disputed'

              let displayStatus: string
              let displayClass: string

              if (booking.status === 'disputed' || wasJustRaised) {
                if (dispute?.status === 'resolved') {
                  displayStatus = 'Dispute upheld'
                  displayClass = 'bg-green-500/10 text-green-600 dark:text-green-400'
                } else if (dispute?.status === 'rejected') {
                  displayStatus = 'Dispute rejected'
                  displayClass = 'bg-destructive/10 text-destructive'
                } else {
                  displayStatus = 'Disputed'
                  displayClass = 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                }
              } else {
                const badge = STATUS_BADGE[booking.status] ?? { label: booking.status, classes: 'bg-muted text-muted-foreground' }
                displayStatus = badge.label
                displayClass = badge.classes
              }

              return (
                <TableRow key={booking.id} className="hover:bg-muted/10">
                  <TableCell className="font-medium text-foreground">
                    {booking.leadName}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {format(parseISO(booking.scheduled_at), 'EEE d MMM yyyy, h:mm a')}
                  </TableCell>
                  <TableCell>
                    <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium', displayClass)}>
                      {displayStatus}
                    </span>
                    {(dispute?.status === 'resolved' || dispute?.status === 'rejected') && dispute?.admin_notes && (
                      <p className="text-xs text-muted-foreground italic mt-0.5">&quot;{dispute.admin_notes}&quot;</p>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {isCompleted && booking.job_value != null
                      ? <span className="text-foreground font-medium">${(booking.job_value / 100).toFixed(2)}</span>
                      : <span className="text-muted-foreground/40">—</span>
                    }
                  </TableCell>
                  <TableCell className="text-sm">
                    {isCompleted && booking.commission_amount != null ? (
                      <span className="inline-flex items-center gap-1 text-foreground font-medium">
                        ${(booking.commission_amount / 100).toFixed(2)}
                        {booking.receipt_url && (
                          <Paperclip className="w-3 h-3 text-muted-foreground" aria-label="Receipt uploaded" />
                        )}
                      </span>
                    ) : (
                      <span className="text-muted-foreground/40">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {booking.status === 'booked' && (
                      <div className="flex items-center gap-1.5">
                        <Select
                          value={getAction(booking.id)}
                          onValueChange={(v) => {
                            if (v === 'complete' || v === 'cancel') {
                              setBookingActions(prev => ({ ...prev, [booking.id]: v }))
                            }
                          }}
                          disabled={isWorking}
                        >
                          <SelectTrigger className="h-7 text-xs w-44">
                            <span className="flex flex-1 text-left">
                              {getAction(booking.id) === 'complete' ? 'Mark complete' : 'Booking cancelled'}
                            </span>
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="complete">Mark complete</SelectItem>
                            <SelectItem value="cancel">Booking cancelled</SelectItem>
                          </SelectContent>
                        </Select>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs px-2.5"
                          onClick={() => handleApply(booking.id)}
                          disabled={isWorking}
                        >
                          {isWorking && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}
                          Apply
                        </Button>
                      </div>
                    )}
                    {booking.status === 'completed' && !dispute && !wasJustRaised && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-muted-foreground text-xs h-7"
                        onClick={() => {
                          setDisputeTarget(booking.id)
                          setDisputeReason('')
                        }}
                      >
                        <AlertCircle className="w-3 h-3 mr-1.5" />
                        Raise dispute
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>

      {/* Complete job confirmation dialog */}
      <Dialog open={completeTarget !== null} onOpenChange={(open) => !open && setCompleteTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Confirm job completion</DialogTitle>
            <DialogDescription>
              Enter the total value of the completed job. The agency commission will be calculated and charged based on this amount.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="job-value">Job value *</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                <Input
                  id="job-value"
                  type="number"
                  min="0.01"
                  step="0.01"
                  placeholder="0.00"
                  value={jobValueInput}
                  onChange={(e) => setJobValueInput(e.target.value)}
                  className="pl-7"
                />
              </div>
            </div>
            <div className="rounded-md bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
              Fee owed:{' '}
              <span className={cn('font-medium', jobValueValid || commissionType === 'flat' ? 'text-foreground' : '')}>
                {calcPreviewCommission()}
              </span>
            </div>
            <div className="space-y-2">
              <Label htmlFor="receipt-file">Job invoice or proof of value</Label>
              <Input
                id="receipt-file"
                type="file"
                accept="image/*,application/pdf"
                onChange={(e) => setReceiptFile(e.target.files?.[0] ?? null)}
                className="cursor-pointer"
              />
              <p className="text-xs text-muted-foreground">
                Attach an invoice, receipt, or photo as proof of the job value.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCompleteTarget(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => completeTarget && handleComplete(completeTarget, jobValueInput)}
              disabled={!jobValueValid}
            >
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
