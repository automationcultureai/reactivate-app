'use client'

import { useState } from 'react'

const INDUSTRIES = [
  'Trades',
  'Cleaning',
  'Health & Wellness',
  'Hospitality',
  'Retail',
  'Professional Services',
  'Other',
]

interface Props {
  clientId: string
  initialValue: string | null
}

export function ClientIndustrySelect({ clientId, initialValue }: Props) {
  const [value, setValue] = useState(initialValue ?? '')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  async function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = e.target.value
    setValue(next)
    setSaving(true)
    setSaved(false)

    try {
      await fetch(`/api/clients/${clientId}/industry`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_industry: next || null }),
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch {
      // Non-fatal — value stays updated locally
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-1.5">
      <select
        value={value}
        onChange={handleChange}
        disabled={saving}
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
      >
        <option value="">— Not set —</option>
        {INDUSTRIES.map((ind) => (
          <option key={ind} value={ind}>
            {ind}
          </option>
        ))}
      </select>
      {saved && <p className="text-xs text-green-600 dark:text-green-400">Saved</p>}
    </div>
  )
}
