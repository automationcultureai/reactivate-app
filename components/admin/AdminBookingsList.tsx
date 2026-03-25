'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { ChevronDown, ChevronRight, Loader2, Paperclip } from 'lucide-react'
import { toast } from 'sonner'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

const STATUS_BADGE: Record<string, { label: string; classes: string }> = {
  booked:    { label: 'Upcoming',  classes: 'bg-blue-500/10 text-blue-600 dark:text-blue-400' },
  completed: { label: 'Completed', classes: 'bg-green-500/10 text-green-600 dark:text-green-400' },
  cancelled: { label: 'Cancelled', classes: 'bg-muted text-muted-foreground' },
  disputed:  { label: 'Disputed',  classes: 'bg-amber-500/10 text-amber-600 dark:text-amber-400' },
}

type BookingRow = {
  id: string
  scheduled_at: string
  completed_at: string | null
  completed_by: string | null
  status: string
  leadName: string
  campaignName: string
}

type CampaignGroup = {
  campaignId: string
  campaignName: string
  bookings: BookingRow[]
  counts: { upcoming: number; completed: number; cancelled: number }
}

export type ClientGroupData = {
  clientId: string
  clientName: string
  campaigns: CampaignGroup[]
  counts: { upcoming: number; completed: number; cancelled: number }
}

const fmtDate = (d: string | null) =>
  d
    ? new Date(d).toLocaleDateString('en-AU', {
        day: 'numeric', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      })
    : '—'

export function AdminBookingsList({ clientGroups }: { clientGroups: ClientGroupData[] }) {
  const allIds = clientGroups.map((g) => g.clientId)
  const [expanded, setExpanded] = useState<Set<string>>(new Set(allIds))
  const allExpanded = expanded.size === allIds.length

  function toggleAll() {
    setExpanded(allExpanded ? new Set() : new Set(allIds))
  }

  function toggle(id: string) {
    setExpanded((prev) => {
      const n = new Set(prev)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })
  }

  if (clientGroups.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 border border-dashed border-border rounded-lg text-center">
        <p className="text-sm text-muted-foreground">No bookings yet.</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button
          onClick={toggleAll}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          {allExpanded ? 'Collapse all' : 'Expand all'}
        </button>
      </div>

      {clientGroups.map((group) => {
        const isOpen = expanded.has(group.clientId)
        return (
          <div key={group.clientId} className="rounded-lg border border-border overflow-hidden">

            {/* Client header — clickable, counts on sub-line */}
            <button
              onClick={() => toggle(group.clientId)}
              className="w-full px-4 py-3 flex items-center gap-3 bg-muted/10 hover:bg-muted/20 transition-colors text-left"
            >
              {isOpen
                ? <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
                : <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
              }
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground truncate">{group.clientName}</p>
                <div className="flex items-center gap-3 text-xs mt-0.5">
                  {group.counts.upcoming  > 0 && <span className="text-blue-600 dark:text-blue-400">{group.counts.upcoming} upcoming</span>}
                  {group.counts.completed > 0 && <span className="text-green-600 dark:text-green-400">{group.counts.completed} completed</span>}
                  {group.counts.cancelled > 0 && <span className="text-muted-foreground">{group.counts.cancelled} cancelled</span>}
                </div>
              </div>
            </button>

            {/* Single flat table — campaign name as inline column */}
            {isOpen && (
              <div className="border-t border-border">
                <Table className="table-fixed w-full">
                  <TableHeader>
                    <TableRow className="bg-muted/20">
                      <TableHead className="font-medium w-1/6">Lead</TableHead>
                      <TableHead className="font-medium w-1/6">Campaign</TableHead>
                      <TableHead className="font-medium w-1/6">Scheduled</TableHead>
                      <TableHead className="font-medium w-1/6">Completed</TableHead>
                      <TableHead className="font-medium w-1/6">By</TableHead>
                      <TableHead className="font-medium w-1/6">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {group.campaigns.flatMap((campaign) =>
                      campaign.bookings.map((b) => {
                        const badge = STATUS_BADGE[b.status] ?? { label: b.status, classes: 'bg-muted text-muted-foreground' }
                        return (
                          <TableRow key={b.id} className="hover:bg-muted/10">
                            <TableCell className="font-medium text-foreground text-sm">{b.leadName}</TableCell>
                            <TableCell className="text-muted-foreground text-sm">{campaign.campaignName}</TableCell>
                            <TableCell className="text-muted-foreground text-sm">{fmtDate(b.scheduled_at)}</TableCell>
                            <TableCell className="text-muted-foreground text-sm">{fmtDate(b.completed_at)}</TableCell>
                            <TableCell className="text-muted-foreground text-sm capitalize">{b.completed_by ?? '—'}</TableCell>
                            <TableCell>
                              <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium', badge.classes)}>
                                {badge.label}
                              </span>
                            </TableCell>
                          </TableRow>
                        )
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// Receipt button — used in billing table
export function ReceiptButton({ bookingId }: { bookingId: string }) {
  const [loading, setLoading] = useState(false)

  async function handleClick() {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/bookings/${bookingId}/receipt`)
      const json = await res.json()
      if (!res.ok) { toast.error(json.error ?? 'Failed to load receipt'); return }
      window.open(json.signedUrl, '_blank', 'noopener')
    } catch {
      toast.error('Failed to load receipt')
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      title="View job invoice"
      className="inline-flex items-center text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
    >
      {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Paperclip className="w-3.5 h-3.5" />}
    </button>
  )
}
