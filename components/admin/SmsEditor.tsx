'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Loader2, Pencil, X, Check, Eye, AlertTriangle } from 'lucide-react'

interface SmsEditorProps {
  smsId: string
  campaignId: string
  sequenceNumber: number
  initialBody: string
  onUpdated: (body: string) => void
  onView?: (body: string, sequenceNumber: number) => void
}

const SEQUENCE_LABELS = ['Initial', 'Follow-up', 'Final follow-up', 'Re-engagement']

export function SmsEditor({
  smsId,
  campaignId,
  sequenceNumber,
  initialBody,
  onUpdated,
  onView,
}: SmsEditorProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [body, setBody] = useState(initialBody)
  const [editBody, setEditBody] = useState(initialBody)
  const [saving, setSaving] = useState(false)

  function startEdit() {
    setEditBody(body)
    setIsEditing(true)
  }

  function cancelEdit() {
    setIsEditing(false)
  }

  async function saveEdit() {
    if (!editBody.trim()) {
      toast.error('Body is required')
      return
    }
    if (editBody.trim().length > 160) {
      toast.error('SMS must be 160 characters or fewer')
      return
    }
    setSaving(true)
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/sms-messages/${smsId}/edit`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: editBody.trim() }),
      })
      const json = await res.json()
      if (!res.ok) {
        toast.error(json.error ?? 'Failed to save')
        return
      }
      setBody(editBody.trim())
      onUpdated(editBody.trim())
      setIsEditing(false)
      toast.success(`SMS ${sequenceNumber} updated`)
    } catch {
      toast.error('Something went wrong')
    } finally {
      setSaving(false)
    }
  }

  const label = SEQUENCE_LABELS[sequenceNumber - 1] ?? `SMS ${sequenceNumber}`
  const charCount = isEditing ? editBody.length : body.length
  const missingBookingLink = isEditing && !editBody.includes('[BOOKING_LINK]')

  return (
    <div className="rounded-md border border-border bg-card p-3 space-y-2">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          SMS {sequenceNumber} — {label}
        </span>
        {!isEditing ? (
          <div className="flex items-center gap-1">
            {onView && (
              <Button variant="ghost" size="icon-sm" onClick={() => onView(body, sequenceNumber)} title="Preview">
                <Eye className="w-3 h-3" />
              </Button>
            )}
            <Button variant="ghost" size="icon-sm" onClick={startEdit} title="Edit">
              <Pencil className="w-3 h-3" />
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={cancelEdit}
              disabled={saving}
              title="Cancel"
            >
              <X className="w-3 h-3" />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={saveEdit}
              disabled={saving}
              title="Save"
              className="text-green-600 hover:text-green-600 hover:bg-green-500/10"
            >
              {saving ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Check className="w-3 h-3" />
              )}
            </Button>
          </div>
        )}
      </div>

      {/* View mode */}
      {!isEditing && (
        <div className="space-y-1">
          <p className="text-xs text-foreground whitespace-pre-wrap leading-relaxed">{body}</p>
          <p className="text-xs text-muted-foreground text-right">
            {charCount}/160
            {charCount > 160 && (
              <span className="text-destructive ml-1">over limit</span>
            )}
          </p>
        </div>
      )}

      {/* Edit mode */}
      {isEditing && (
        <div className="space-y-2">
          <div className="space-y-1">
            <Label className="text-xs">Body</Label>
            <Textarea
              value={editBody}
              onChange={(e) => setEditBody(e.target.value)}
              disabled={saving}
              rows={4}
              className="text-sm resize-none"
            />
            <div className="flex items-center justify-between">
              {missingBookingLink ? (
                <span className="text-xs text-amber-500 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" />
                  [BOOKING_LINK] missing
                </span>
              ) : (
                <span />
              )}
              <p className={`text-xs text-right ${editBody.length > 160 ? 'text-destructive' : 'text-muted-foreground'}`}>
                {editBody.length}/160
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
