'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Loader2, Pencil, X, Check, Eye } from 'lucide-react'

interface EmailEditorProps {
  emailId: string
  campaignId: string
  sequenceNumber: number
  initialSubject: string
  initialBody: string
  onUpdated: (subject: string, body: string) => void
  onView?: (subject: string, body: string) => void
}

const SEQUENCE_LABELS = ['Initial', 'Follow-up', 'Final follow-up', 'Re-engagement']

export function EmailEditor({
  emailId,
  campaignId,
  sequenceNumber,
  initialSubject,
  initialBody,
  onUpdated,
  onView,
}: EmailEditorProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [subject, setSubject] = useState(initialSubject)
  const [body, setBody] = useState(initialBody)
  const [editSubject, setEditSubject] = useState(initialSubject)
  const [editBody, setEditBody] = useState(initialBody)
  const [saving, setSaving] = useState(false)

  function startEdit() {
    setEditSubject(subject)
    setEditBody(body)
    setIsEditing(true)
  }

  function cancelEdit() {
    setIsEditing(false)
  }

  async function saveEdit() {
    if (!editSubject.trim() || !editBody.trim()) {
      toast.error('Subject and body are required')
      return
    }
    setSaving(true)
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/emails/${emailId}/edit`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject: editSubject.trim(), body: editBody.trim() }),
      })
      const json = await res.json()
      if (!res.ok) {
        toast.error(json.error ?? 'Failed to save')
        return
      }
      setSubject(editSubject.trim())
      setBody(editBody.trim())
      onUpdated(editSubject.trim(), editBody.trim())
      setIsEditing(false)
      toast.success(`Email ${sequenceNumber} updated`)
    } catch {
      toast.error('Something went wrong')
    } finally {
      setSaving(false)
    }
  }

  const label = SEQUENCE_LABELS[sequenceNumber - 1] ?? `Email ${sequenceNumber}`

  return (
    <div className="rounded-md border border-border bg-card p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Email {sequenceNumber} — {label}
        </span>
        {!isEditing ? (
          <div className="flex items-center gap-1">
            {onView && (
              <Button variant="ghost" size="icon-sm" onClick={() => onView(subject, body)} title="Preview">
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
        <div className="space-y-2">
          <p className="text-sm font-medium text-foreground leading-snug">{subject}</p>
          <p className="text-xs text-muted-foreground whitespace-pre-wrap leading-relaxed line-clamp-4">
            {body}
          </p>
        </div>
      )}

      {/* Edit mode */}
      {isEditing && (
        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">Subject</Label>
            <Input
              value={editSubject}
              onChange={(e) => setEditSubject(e.target.value)}
              disabled={saving}
              className="text-sm"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Body</Label>
            <Textarea
              value={editBody}
              onChange={(e) => setEditBody(e.target.value)}
              disabled={saving}
              rows={6}
              className="text-sm resize-none"
            />
            <p className="text-xs text-muted-foreground text-right">
              {editBody.split(/\s+/).filter(Boolean).length} words
              {editBody.split(/\s+/).filter(Boolean).length > 150 && (
                <span className="text-amber-500 ml-1">— exceeds 150 word guideline</span>
              )}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
