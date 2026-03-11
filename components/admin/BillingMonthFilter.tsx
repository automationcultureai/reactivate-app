'use client'

import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'

interface BillingMonthFilterProps {
  selectedMonth: string | null  // 'YYYY-MM' or null = all time
}

export function BillingMonthFilter({ selectedMonth }: BillingMonthFilterProps) {
  const router = useRouter()

  // Build last 12 months newest-first
  const months: { value: string; label: string }[] = []
  const now = new Date()
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const label = d.toLocaleDateString('en-AU', { month: 'short', year: 'numeric' })
    months.push({ value, label })
  }

  function select(month: string | null) {
    router.push(month ? `/admin/billing?month=${month}` : '/admin/billing')
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-xs text-muted-foreground mr-1">Filter by month:</span>
      <button
        onClick={() => select(null)}
        className={cn(
          'px-3 py-1 rounded-full text-xs font-medium border transition-colors',
          !selectedMonth
            ? 'bg-primary text-primary-foreground border-primary'
            : 'border-border text-muted-foreground hover:border-foreground hover:text-foreground'
        )}
      >
        All time
      </button>
      {months.map(({ value, label }) => (
        <button
          key={value}
          onClick={() => select(value)}
          className={cn(
            'px-3 py-1 rounded-full text-xs font-medium border transition-colors',
            selectedMonth === value
              ? 'bg-primary text-primary-foreground border-primary'
              : 'border-border text-muted-foreground hover:border-foreground hover:text-foreground'
          )}
        >
          {label}
        </button>
      ))}
    </div>
  )
}
