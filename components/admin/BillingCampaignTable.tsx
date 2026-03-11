'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { BillingStatusSelect, type InvoiceStatus } from './BillingStatusSelect'
import { Loader2 } from 'lucide-react'

const STATUS_LABELS: Record<InvoiceStatus, string> = {
  outstanding:  'Outstanding',
  invoice_sent: 'Invoice sent',
  invoice_paid: 'Invoice paid',
}

export interface BillingBookingRow {
  id: string
  scheduled_at: string
  completed_at: string | null
  completed_by: string | null
  commission_owed: number
  status: string
  leadName: string
  invoiceStatus: InvoiceStatus
}

interface BillingCampaignTableProps {
  campaignId: string
  campaignName: string
  bookings: BillingBookingRow[]
  total: number
}

const fmt = (cents: number) => `$${(cents / 100).toFixed(2)}`
const fmtDate = (d: string | null) =>
  d ? new Date(d).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'

export function BillingCampaignTable({ campaignName, bookings, total }: BillingCampaignTableProps) {
  const router = useRouter()
  const [selected, setSelected]       = useState<Set<string>>(new Set())
  const [bulkStatus, setBulkStatus]   = useState<InvoiceStatus>('invoice_sent')
  const [campaignStatus, setCampaignStatus] = useState<InvoiceStatus>('invoice_sent')
  const [working, setWorking]         = useState(false)

  const allIds = bookings.map((b) => b.id)
  const allSelected = selected.size === allIds.length && allIds.length > 0

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(allIds))
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  async function applyStatus(ids: string[], status: InvoiceStatus) {
    if (ids.length === 0) return
    setWorking(true)
    try {
      const res = await fetch('/api/billing/set-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ booking_ids: ids, status }),
      })
      if (!res.ok) {
        const json = await res.json()
        toast.error(json.error ?? 'Failed to update')
        return
      }
      toast.success(`${ids.length} booking${ids.length !== 1 ? 's' : ''} marked as ${STATUS_LABELS[status]}`)
      setSelected(new Set())
      router.refresh()
    } catch {
      toast.error('Something went wrong')
    } finally {
      setWorking(false)
    }
  }

  return (
    <div className="rounded-lg border border-border overflow-hidden">
      {/* Campaign header */}
      <div className="px-4 py-2.5 bg-muted/20 border-b border-border flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <p className="text-xs font-semibold text-foreground">{campaignName}</p>
          <p className="text-xs font-mono text-muted-foreground">{fmt(total)}</p>
        </div>

        {/* Campaign-level bulk action */}
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground">Set all to:</span>
          <Select
            value={campaignStatus}
            onValueChange={(v) => { if (v === 'outstanding' || v === 'invoice_sent' || v === 'invoice_paid') setCampaignStatus(v) }}
            disabled={working}
          >
            <SelectTrigger className="h-7 text-xs w-36">
              <span className="flex flex-1 text-left">{STATUS_LABELS[campaignStatus]}</span>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="outstanding">Outstanding</SelectItem>
              <SelectItem value="invoice_sent">Invoice sent</SelectItem>
              <SelectItem value="invoice_paid">Invoice paid</SelectItem>
            </SelectContent>
          </Select>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs px-2.5"
            disabled={working}
            onClick={() => applyStatus(allIds, campaignStatus)}
          >
            {working ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Apply to all'}
          </Button>
        </div>
      </div>

      {/* Bulk selection bar — only shown when rows are checked */}
      {selected.size > 0 && (
        <div className="px-4 py-2 bg-primary/5 border-b border-border flex items-center gap-3 flex-wrap">
          <span className="text-xs font-medium text-foreground">{selected.size} selected</span>
          <Select
            value={bulkStatus}
            onValueChange={(v) => { if (v === 'outstanding' || v === 'invoice_sent' || v === 'invoice_paid') setBulkStatus(v) }}
            disabled={working}
          >
            <SelectTrigger className="h-7 text-xs w-36">
              <span className="flex flex-1 text-left">{STATUS_LABELS[bulkStatus]}</span>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="outstanding">Outstanding</SelectItem>
              <SelectItem value="invoice_sent">Invoice sent</SelectItem>
              <SelectItem value="invoice_paid">Invoice paid</SelectItem>
            </SelectContent>
          </Select>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs px-2.5"
            disabled={working}
            onClick={() => applyStatus(Array.from(selected), bulkStatus)}
          >
            {working ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Apply to selected'}
          </Button>
          <button
            className="text-xs text-muted-foreground hover:text-foreground ml-auto"
            onClick={() => setSelected(new Set())}
          >
            Clear
          </button>
        </div>
      )}

      <Table>
        <TableHeader>
          <TableRow className="bg-muted/10">
            <TableHead className="w-10">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={toggleAll}
                className="rounded border-border cursor-pointer"
              />
            </TableHead>
            <TableHead className="font-medium">Lead</TableHead>
            <TableHead className="font-medium">Appointment</TableHead>
            <TableHead className="font-medium">Completed</TableHead>
            <TableHead className="font-medium">By</TableHead>
            <TableHead className="font-medium text-right">Commission</TableHead>
            <TableHead className="font-medium w-44">Invoice status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {bookings.map((b) => (
            <TableRow
              key={b.id}
              className={cn('hover:bg-muted/10', selected.has(b.id) && 'bg-primary/5')}
            >
              <TableCell>
                <input
                  type="checkbox"
                  checked={selected.has(b.id)}
                  onChange={() => toggleOne(b.id)}
                  className="rounded border-border cursor-pointer"
                />
              </TableCell>
              <TableCell className="text-foreground text-sm">{b.leadName}</TableCell>
              <TableCell className="text-muted-foreground text-sm">{fmtDate(b.scheduled_at)}</TableCell>
              <TableCell className="text-muted-foreground text-sm">{fmtDate(b.completed_at)}</TableCell>
              <TableCell className="text-muted-foreground text-sm capitalize">{b.completed_by ?? '—'}</TableCell>
              <TableCell className="text-right font-mono text-sm font-medium">{fmt(b.commission_owed)}</TableCell>
              <TableCell>
                <BillingStatusSelect bookingId={b.id} initialStatus={b.invoiceStatus} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
