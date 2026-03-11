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

export function AddLeadsDialog({
  campaignId,
  channel,
  open,
  onOpenChange,
  onAdded,
}: AddLeadsDialogProps) {
  const [csvResult, setCsvResult] = useState<CsvParseResult | null>(null)
  const [adding, setAdding] = useState(false)
  const [confirmDuplicates, setConfirmDuplicates] = useState(false)
  const [duplicateInfo, setDuplicateInfo] = useState<{ count: number; message: string } | null>(null)

  async function handleAdd(force = false) {
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
      onOpenChange(false)
      setCsvResult(null)
      setDuplicateInfo(null)
      setConfirmDuplicates(false)
    } catch {
      toast.error('Something went wrong')
    } finally {
      setAdding(false)
    }
  }

  function handleClose(open: boolean) {
    if (!open) {
      setCsvResult(null)
      setDuplicateInfo(null)
      setConfirmDuplicates(false)
    }
    onOpenChange(open)
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add leads to campaign</DialogTitle>
          <DialogDescription>
            Upload a CSV to add new leads. Existing leads are not affected.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
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
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleClose(false)} disabled={adding}>
            Cancel
          </Button>
          {duplicateInfo ? (
            <Button onClick={() => handleAdd(true)} disabled={adding}>
              {adding && <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />}
              Add anyway
            </Button>
          ) : (
            <Button
              onClick={() => handleAdd(false)}
              disabled={adding || !csvResult || csvResult.leads.length === 0}
            >
              {adding && <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />}
              {csvResult ? `Add ${csvResult.leads.length} leads` : 'Add leads'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
