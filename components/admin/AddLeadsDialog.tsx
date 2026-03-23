'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { CsvUploader } from '@/components/admin/CsvUploader'
import { CsvParseResult } from '@/lib/csv'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Loader2, AlertCircle } from 'lucide-react'

interface AddLeadsDialogProps {
  campaignId: string
  channel: 'email' | 'sms' | 'both'
  open: boolean
  onOpenChange: (open: boolean) => void
  onAdded: (count: number) => void
}

const EMPTY_FORM = {
  name: '',
  email: '',
  phone: '',
  service_type: '',
  notes: '',
  last_contact_date: '',
  purchase_count: '',
  lifetime_value: '',
}

export function AddLeadsDialog({
  campaignId,
  channel,
  open,
  onOpenChange,
  onAdded,
}: AddLeadsDialogProps) {
  const [tab, setTab] = useState<'csv' | 'manual'>('csv')
  const [csvResult, setCsvResult] = useState<CsvParseResult | null>(null)
  const [adding, setAdding] = useState(false)
  const [confirmDuplicates, setConfirmDuplicates] = useState(false)
  const [duplicateInfo, setDuplicateInfo] = useState<{ count: number; message: string } | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [formError, setFormError] = useState<string | null>(null)

  function handleFormChange(field: keyof typeof EMPTY_FORM, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
    setFormError(null)
  }

  function validateManualForm(): string | null {
    if (!form.name.trim()) return 'Name is required'
    if (channel !== 'sms' && !form.email.trim()) return 'Email is required for this campaign channel'
    if (channel === 'sms' && !form.phone.trim()) return 'Phone is required for SMS campaigns'
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) return 'Invalid email address'
    return null
  }

  async function handleAddManual(force = false) {
    const err = validateManualForm()
    if (err) { setFormError(err); return }

    setAdding(true)
    try {
      const lead: Record<string, string | undefined> = {
        name: form.name.trim(),
        email: form.email.trim() || undefined,
        phone: form.phone.trim() || undefined,
        service_type: form.service_type.trim() || undefined,
        notes: form.notes.trim() || undefined,
        last_contact_date: form.last_contact_date || undefined,
        purchase_count: form.purchase_count || undefined,
        lifetime_value: form.lifetime_value || undefined,
      }
      // Remove undefined keys
      Object.keys(lead).forEach((k) => lead[k] === undefined && delete lead[k])

      const res = await fetch(`/api/campaigns/${campaignId}/leads`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leads: [lead], confirm_duplicates: force }),
      })
      const json = await res.json()
      if (!res.ok) { toast.error(json.error ?? 'Failed to add lead'); return }
      if (json.requires_confirmation) {
        setDuplicateInfo({ count: json.duplicate_count, message: json.message })
        setConfirmDuplicates(true)
        return
      }
      toast.success('Lead added successfully')
      toast.info('Click "Generate sequences" to generate emails for the new lead.')
      onAdded(json.added)
      handleClose(false)
    } catch {
      toast.error('Something went wrong')
    } finally {
      setAdding(false)
    }
  }

  async function handleAddCsv(force = false) {
    if (!csvResult || csvResult.leads.length === 0) {
      toast.error('Please upload a CSV with at least one valid lead')
      return
    }
    setAdding(true)
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/leads`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leads: csvResult.leads,
          confirm_duplicates: force,
        }),
      })
      const json = await res.json()
      if (!res.ok) {
        toast.error(json.error ?? 'Failed to add leads')
        return
      }
      if (json.requires_confirmation) {
        setDuplicateInfo({ count: json.duplicate_count, message: json.message })
        setConfirmDuplicates(true)
        return
      }
      toast.success(`${json.added} leads added successfully`)
      if (json.added > 0) {
        toast.info('Click "Generate sequences" to generate emails for the new leads.')
      }
      onAdded(json.added)
      handleClose(false)
    } catch {
      toast.error('Something went wrong')
    } finally {
      setAdding(false)
    }
  }

  function handleClose(openState: boolean) {
    if (!openState) {
      setCsvResult(null)
      setDuplicateInfo(null)
      setConfirmDuplicates(false)
      setForm(EMPTY_FORM)
      setFormError(null)
      setTab('csv')
    }
    onOpenChange(openState)
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add leads to campaign</DialogTitle>
          <DialogDescription>
            Upload a CSV or enter a lead manually.
          </DialogDescription>
        </DialogHeader>

        {/* Tab switcher */}
        <div className="flex gap-1 p-1 rounded-md bg-muted/40 border border-border w-fit">
          <button
            onClick={() => setTab('csv')}
            className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${
              tab === 'csv'
                ? 'bg-background shadow-sm text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Upload CSV
          </button>
          <button
            onClick={() => setTab('manual')}
            className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${
              tab === 'manual'
                ? 'bg-background shadow-sm text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Add manually
          </button>
        </div>

        <div className="space-y-4 py-2">
          {tab === 'csv' ? (
            <>
              <CsvUploader channel={channel} onParsed={setCsvResult} />
              {duplicateInfo && (
                <div className="flex items-start gap-2 p-3 rounded-md bg-amber-500/10 border border-amber-500/20">
                  <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <p className="text-xs text-amber-700 dark:text-amber-400">{duplicateInfo.message}</p>
                    <p className="text-xs text-muted-foreground">Add them anyway?</p>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2 space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">
                    Full name <span className="text-destructive">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="Jane Smith"
                    value={form.name}
                    onChange={(e) => handleFormChange('name', e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-md border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">
                    Email {channel !== 'sms' && <span className="text-destructive">*</span>}
                  </label>
                  <input
                    type="email"
                    placeholder="jane@example.com"
                    value={form.email}
                    onChange={(e) => handleFormChange('email', e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-md border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">
                    Phone {channel !== 'email' && <span className="text-destructive">*</span>}
                  </label>
                  <input
                    type="tel"
                    placeholder="+61400000000"
                    value={form.phone}
                    onChange={(e) => handleFormChange('phone', e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-md border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Service type</label>
                  <input
                    type="text"
                    placeholder="e.g. Lawn mowing"
                    value={form.service_type}
                    onChange={(e) => handleFormChange('service_type', e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-md border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Last contact date</label>
                  <input
                    type="date"
                    value={form.last_contact_date}
                    onChange={(e) => handleFormChange('last_contact_date', e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-md border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">No. of purchases</label>
                  <input
                    type="number"
                    min="0"
                    placeholder="3"
                    value={form.purchase_count}
                    onChange={(e) => handleFormChange('purchase_count', e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-md border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Lifetime value ($)</label>
                  <input
                    type="number"
                    min="0"
                    placeholder="500"
                    value={form.lifetime_value}
                    onChange={(e) => handleFormChange('lifetime_value', e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-md border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
                <div className="col-span-2 space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Notes</label>
                  <textarea
                    placeholder="Any context about this lead…"
                    value={form.notes}
                    onChange={(e) => handleFormChange('notes', e.target.value)}
                    rows={2}
                    className="w-full px-3 py-2 text-sm rounded-md border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                  />
                </div>
              </div>
              {formError && (
                <div className="flex items-center gap-2 p-2.5 rounded-md bg-destructive/10 border border-destructive/20">
                  <AlertCircle className="w-3.5 h-3.5 text-destructive shrink-0" />
                  <p className="text-xs text-destructive">{formError}</p>
                </div>
              )}
              {duplicateInfo && (
                <div className="flex items-start gap-2 p-3 rounded-md bg-amber-500/10 border border-amber-500/20">
                  <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <p className="text-xs text-amber-700 dark:text-amber-400">{duplicateInfo.message}</p>
                    <p className="text-xs text-muted-foreground">Add anyway?</p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleClose(false)} disabled={adding}>
            Cancel
          </Button>
          {tab === 'csv' ? (
            duplicateInfo ? (
              <Button onClick={() => handleAddCsv(true)} disabled={adding}>
                {adding && <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />}
                Add anyway
              </Button>
            ) : (
              <Button
                onClick={() => handleAddCsv(false)}
                disabled={adding || !csvResult || csvResult.leads.length === 0}
              >
                {adding && <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />}
                {csvResult ? `Add ${csvResult.leads.length} leads` : 'Add leads'}
              </Button>
            )
          ) : (
            duplicateInfo ? (
              <Button onClick={() => handleAddManual(true)} disabled={adding}>
                {adding && <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />}
                Add anyway
              </Button>
            ) : (
              <Button onClick={() => handleAddManual(false)} disabled={adding}>
                {adding && <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />}
                Add lead
              </Button>
            )
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
