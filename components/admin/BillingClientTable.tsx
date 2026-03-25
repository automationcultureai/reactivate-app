'use client'

import { useState, useCallback } from 'react'
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
import { BillingStatusSelect, STATUS_LABELS, type InvoiceStatus } from './BillingStatusSelect'
import { Loader2 } from 'lucide-react'
import { ReceiptButton } from './AdminBookingsList'

export interface BillingBookingRow {
  id: string
  campaignName: string
  scheduled_at: string
  completed_at: string | null
  completed_by: string | null
  commission_owed: number
  commission_amount: number | null
  job_value: number | null
  receipt_url: string | null
  status: string
  leadName: string
  invoiceStatus: InvoiceStatus
}

interface BillingClientTableProps {
  bookings: BillingBookingRow[]
}

const fmt     = (cents: number) => `$${(cents / 100).toFixed(2)}`
const fmtDate = (d: string | null) =>
  d ? new Date(d).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'

export function BillingClientTable({ bookings }: BillingClientTableProps) {
  const [statusMap, setStatusMap] = useState<Record<string, InvoiceStatus>>(() =>
    Object.fromEntries(bookings.map((b) => [b.id, b.invoiceStatus]))
  )

  const [selected, setSelected]     = useState<Set<string>>(new Set())
  const [bulkStatus, setBulkStatus] = useState<InvoiceStatus>('invoice_sent')
  const [working, setWorking]       = useState(false)

  const allIds      = bookings.map((b) => b.id)
  const allSelected = selected.size === allIds.length && allIds.length > 0

  function toggleAll() { setSelected(allSelected ? new Set() : new Set(allIds)) }
  function toggleOne(id: string) {
    setSelected((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  const applyStatus = useCallback(async (ids: string[], status: InvoiceStatus) => {
    if (ids.length === 0) return

    const prev: Record<string, InvoiceStatus> = {}
    ids.forEach((id) => { prev[id] = statusMap[id] ?? 'outstanding' })

    setStatusMap((m) => { const n = { ...m }; ids.forEach((id) => { n[id] = status }); return n })
    setWorking(true)

    try {
      const res = await fetch('/api/billing/set-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ booking_ids: ids, status }),
      })
      if (!res.ok) {
        setStatusMap((m) => { const n = { ...m }; Object.assign(n, prev); return n })
        const json = await res.json()
        toast.error(json.error ?? 'Failed to update')
        return
      }
      toast.success(`${ids.length} booking${ids.length !== 1 ? 's' : ''} marked as ${STATUS_LABELS[status]}`)
      setSelected(new Set())
    } catch {
      setStatusMap((m) => { const n = { ...m }; Object.assign(n, prev); return n })
      toast.error('Something went wrong')
    } finally {
      setWorking(false)
    }
  }, [statusMap])

  return (
    <div>
      {/* Bulk selection bar */}
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
            size="sm" variant="outline" className="h-7 text-xs px-2.5"
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
              <input type="checkbox" checked={allSelected} onChange={toggleAll}
                className="rounded border-border cursor-pointer" />
            </TableHead>
            <TableHead className="font-medium w-48">Lead</TableHead>
            <TableHead className="font-medium">Campaign</TableHead>
            <TableHead className="font-medium w-36">Appointment</TableHead>
            <TableHead className="font-medium w-36">Completed</TableHead>
            <TableHead className="font-medium w-24">By</TableHead>
            <TableHead className="font-medium w-28 text-right">Job value</TableHead>
            <TableHead className="font-medium w-32 text-right">Commission</TableHead>
            <TableHead className="font-medium w-44 text-right">Invoice status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {bookings.map((b) => (
            <TableRow
              key={b.id}
              className={cn('group/row hover:bg-muted/10', selected.has(b.id) && 'bg-primary/5')}
            >
              <TableCell>
                <input
                  type="checkbox"
                  checked={selected.has(b.id)}
                  onChange={() => toggleOne(b.id)}
                  className={cn(
                    'rounded border-border cursor-pointer transition-opacity',
                    selected.has(b.id) ? 'opacity-100' : 'opacity-0 group-hover/row:opacity-100'
                  )}
                />
              </TableCell>
              <TableCell className="text-foreground text-sm font-semibold">{b.leadName}</TableCell>
              <TableCell className="text-muted-foreground text-sm">{b.campaignName}</TableCell>
              <TableCell className="text-muted-foreground text-sm">{fmtDate(b.scheduled_at)}</TableCell>
              <TableCell className="text-muted-foreground text-sm">{fmtDate(b.completed_at)}</TableCell>
              <TableCell className="text-muted-foreground text-sm capitalize">{b.completed_by ?? '—'}</TableCell>
              <TableCell className="text-right font-mono text-sm text-muted-foreground">
                {b.job_value != null ? fmt(b.job_value) : '—'}
              </TableCell>
              <TableCell className="text-right">
                <span className="inline-flex items-center gap-1.5 justify-end font-mono text-sm font-semibold text-foreground bg-muted/30 rounded px-1.5 py-0.5">
                  {fmt(b.commission_amount ?? b.commission_owed)}
                  {b.receipt_url && <ReceiptButton bookingId={b.id} />}
                </span>
              </TableCell>
              <TableCell className="text-right">
                <BillingStatusSelect
                  status={statusMap[b.id] ?? b.invoiceStatus}
                  onStatusChange={(s) => applyStatus([b.id], s)}
                  disabled={working}
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
