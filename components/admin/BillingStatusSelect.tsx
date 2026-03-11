'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/components/ui/select'

export type InvoiceStatus = 'outstanding' | 'invoice_sent' | 'invoice_paid'

const STATUS_LABELS: Record<InvoiceStatus, string> = {
  outstanding: 'Outstanding',
  invoice_sent: 'Invoice sent',
  invoice_paid: 'Invoice paid',
}

const STATUS_CLASSES: Record<InvoiceStatus, string> = {
  outstanding: 'bg-muted text-muted-foreground',
  invoice_sent: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  invoice_paid: 'bg-green-500/10 text-green-600 dark:text-green-400',
}

interface BillingStatusSelectProps {
  bookingId: string
  initialStatus: InvoiceStatus
}

export function BillingStatusSelect({ bookingId, initialStatus }: BillingStatusSelectProps) {
  const [status, setStatus] = useState<InvoiceStatus>(initialStatus)
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleChange(newStatus: InvoiceStatus) {
    if (newStatus === status || loading) return
    const prev = status
    setStatus(newStatus)
    setLoading(true)
    try {
      const res = await fetch('/api/billing/set-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ booking_id: bookingId, status: newStatus }),
      })
      if (!res.ok) {
        setStatus(prev)
        const json = await res.json()
        toast.error(json.error ?? 'Failed to update')
        return
      }
      toast.success(`Marked as ${STATUS_LABELS[newStatus]}`)
      router.refresh()
    } catch {
      setStatus(prev)
      toast.error('Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Select
      value={status}
      onValueChange={(v) => { if (v === 'outstanding' || v === 'invoice_sent' || v === 'invoice_paid') handleChange(v) }}
      disabled={loading}
    >
      <SelectTrigger className="h-7 text-xs w-36 border-0 bg-transparent p-0 shadow-none focus-visible:ring-0 hover:bg-muted/30 rounded-md px-1.5">
        <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium', STATUS_CLASSES[status])}>
          {STATUS_LABELS[status]}
        </span>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="outstanding">Outstanding</SelectItem>
        <SelectItem value="invoice_sent">Invoice sent</SelectItem>
        <SelectItem value="invoice_paid">Invoice paid</SelectItem>
      </SelectContent>
    </Select>
  )
}
