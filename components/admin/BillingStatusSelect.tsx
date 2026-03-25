'use client'

import { cn } from '@/lib/utils'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/components/ui/select'

export type InvoiceStatus = 'outstanding' | 'invoice_sent' | 'invoice_paid'

export const STATUS_LABELS: Record<InvoiceStatus, string> = {
  outstanding:  'Outstanding',
  invoice_sent: 'Invoice sent',
  invoice_paid: 'Invoice paid',
}

export const STATUS_CLASSES: Record<InvoiceStatus, string> = {
  outstanding:  'bg-muted text-muted-foreground',
  invoice_sent: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  invoice_paid: 'bg-green-500/10 text-green-600 dark:text-green-400',
}

interface BillingStatusSelectProps {
  status: InvoiceStatus
  onStatusChange: (status: InvoiceStatus) => void
  disabled?: boolean
}

export function BillingStatusSelect({ status, onStatusChange, disabled }: BillingStatusSelectProps) {
  return (
    <Select
      value={status}
      onValueChange={(v) => {
        if (v === 'outstanding' || v === 'invoice_sent' || v === 'invoice_paid') {
          onStatusChange(v)
        }
      }}
      disabled={disabled}
    >
      <SelectTrigger className="h-7 w-auto border-0 bg-transparent p-0 shadow-none focus-visible:ring-0 hover:opacity-80 rounded-md justify-end">
        <span className={cn('inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold', STATUS_CLASSES[status])}>
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
