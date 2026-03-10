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
import { CheckCircle, Loader2, Calendar } from 'lucide-react'
import { cn } from '@/lib/utils'

const STATUS_BADGE: Record<string, { label: string; classes: string }> = {
  booked: { label: 'Booked', classes: 'bg-blue-500/10 text-blue-600 dark:text-blue-400' },
  completed: { label: 'Completed', classes: 'bg-green-500/10 text-green-600 dark:text-green-400' },
  cancelled: { label: 'Cancelled', classes: 'bg-muted text-muted-foreground' },
  disputed: { label: 'Disputed', classes: 'bg-amber-500/10 text-amber-600 dark:text-amber-400' },
}

interface CampaignBookingsProps {
  bookings: (Booking & { leadName: string })[]
}

export function CampaignBookings({ bookings: initialBookings }: CampaignBookingsProps) {
  const [bookings, setBookings] = useState(initialBookings)
  const [completing, setCompleting] = useState<string | null>(null)

  async function handleAdminComplete(bookingId: string) {
    setCompleting(bookingId)
    try {
      const res = await fetch('/api/jobs/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId, completedBy: 'admin' }),
      })
      const json = await res.json()
      if (!res.ok) {
        toast.error(json.error ?? 'Failed to complete booking')
        return
      }
      toast.success('Booking marked complete (admin override)')
      setBookings((prev) =>
        prev.map((b) => (b.id === bookingId ? { ...b, status: 'completed' } : b))
      )
    } catch {
      toast.error('Something went wrong')
    } finally {
      setCompleting(null)
    }
  }

  if (bookings.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 border border-dashed border-border rounded-lg text-center">
        <Calendar className="w-6 h-6 text-muted-foreground/30 mb-2" />
        <p className="text-sm text-muted-foreground">No bookings for this campaign yet</p>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/30">
            <TableHead className="font-medium">Lead</TableHead>
            <TableHead className="font-medium">Scheduled</TableHead>
            <TableHead className="font-medium">Status</TableHead>
            <TableHead className="font-medium">Completed by</TableHead>
            <TableHead className="w-44" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {bookings.map((booking) => {
            const badge = STATUS_BADGE[booking.status] ?? {
              label: booking.status,
              classes: 'bg-muted text-muted-foreground',
            }
            const isCompleting = completing === booking.id

            return (
              <TableRow key={booking.id} className="hover:bg-muted/10">
                <TableCell className="font-medium text-foreground">{booking.leadName}</TableCell>
                <TableCell className="text-muted-foreground text-sm">
                  {format(parseISO(booking.scheduled_at), 'dd MMM yyyy, h:mm a')}
                </TableCell>
                <TableCell>
                  <span
                    className={cn(
                      'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium',
                      badge.classes
                    )}
                  >
                    {badge.label}
                  </span>
                </TableCell>
                <TableCell className="text-muted-foreground text-sm capitalize">
                  {booking.completed_by ?? '—'}
                </TableCell>
                <TableCell>
                  {booking.status === 'booked' && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleAdminComplete(booking.id)}
                      disabled={isCompleting}
                    >
                      {isCompleting ? (
                        <Loader2 className="w-3 h-3 mr-1.5 animate-spin" />
                      ) : (
                        <CheckCircle className="w-3 h-3 mr-1.5" />
                      )}
                      Override complete
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
