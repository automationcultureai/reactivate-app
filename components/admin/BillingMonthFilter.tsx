'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { cn } from '@/lib/utils'

interface Props {
  selectedMonth: string | null   // 'YYYY-MM' or null
  customFrom: string | null      // 'YYYY-MM-DD' or null
  customTo: string | null        // 'YYYY-MM-DD' or null
}

export function BillingMonthFilter({ selectedMonth, customFrom, customTo }: Props) {
  const router = useRouter()

  const [fromInput, setFromInput] = useState(customFrom ?? '')
  const [toInput, setToInput]     = useState(customTo ?? '')
  const [error, setError]         = useState('')

  // Build last 12 months newest-first
  const months: { value: string; label: string }[] = []
  const now = new Date()
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const label = d.toLocaleDateString('en-AU', { month: 'short', year: 'numeric' })
    months.push({ value, label })
  }

  const isCustomActive = !!(customFrom && customTo)
  // Dropdown value: 'all' or a YYYY-MM string
  const dropdownValue = isCustomActive ? '' : (selectedMonth ?? 'all')

  function selectMonth(value: string) {
    setFromInput('')
    setToInput('')
    setError('')
    router.push(value === 'all' ? '/admin/billing' : `/admin/billing?month=${value}`)
  }

  function applyCustomRange() {
    setError('')
    if (!fromInput || !toInput) { setError('Please set both a start and end date.'); return }
    if (new Date(fromInput) > new Date(toInput)) { setError('Start date must be before end date.'); return }
    router.push(`/admin/billing?from=${fromInput}&to=${toInput}`)
  }

  function clearCustomRange() {
    setFromInput('')
    setToInput('')
    setError('')
    router.push('/admin/billing')
  }

  return (
    <div className="flex items-center gap-4 flex-wrap">
      {/* Month dropdown */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground shrink-0">Month:</span>
        <select
          value={dropdownValue}
          onChange={(e) => selectMonth(e.target.value)}
          className="h-7 rounded-md border border-border bg-background text-foreground text-xs px-2 focus:outline-none focus:ring-2 focus:ring-ring cursor-pointer"
        >
          <option value="all">All time</option>
          {months.map(({ value, label }) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
      </div>

      <span className="text-xs text-muted-foreground/40 hidden sm:block">·</span>

      {/* Custom date range */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-muted-foreground shrink-0">Custom range:</span>
        <input
          type="date"
          value={fromInput}
          onChange={(e) => { setFromInput(e.target.value); setError('') }}
          className={cn(
            'h-7 rounded-md border px-2 text-xs bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring',
            isCustomActive && customFrom === fromInput ? 'border-primary' : 'border-border'
          )}
        />
        <span className="text-xs text-muted-foreground">to</span>
        <input
          type="date"
          value={toInput}
          onChange={(e) => { setToInput(e.target.value); setError('') }}
          min={fromInput || undefined}
          className={cn(
            'h-7 rounded-md border px-2 text-xs bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring',
            isCustomActive && customTo === toInput ? 'border-primary' : 'border-border'
          )}
        />
        <button
          onClick={applyCustomRange}
          className="h-7 px-3 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
        >
          Apply
        </button>
        {isCustomActive && (
          <button
            onClick={clearCustomRange}
            className="h-7 px-3 rounded-md text-xs font-medium border border-border text-muted-foreground hover:text-foreground hover:border-foreground transition-colors"
          >
            Clear
          </button>
        )}
        {error && <span className="text-xs text-destructive">{error}</span>}
      </div>
    </div>
  )
}
