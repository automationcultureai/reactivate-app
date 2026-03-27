'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { CampaignTemplate } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Loader2 } from 'lucide-react'

const CHANNELS = [
  { value: 'email', label: 'Email only' },
  { value: 'sms', label: 'SMS only' },
  { value: 'both', label: 'Email + SMS' },
] as const

const TONE_PRESETS = [
  { value: 'professional', label: 'Professional' },
  { value: 'friendly', label: 'Friendly' },
  { value: 'casual', label: 'Casual' },
  { value: 'empathetic', label: 'Empathetic' },
  { value: 'direct', label: 'Direct' },
  { value: 'authoritative', label: 'Authoritative' },
  { value: 'playful', label: 'Playful' },
  { value: 'sincere', label: 'Sincere' },
  { value: 'nostalgic', label: 'Nostalgic' },
  { value: 'consultative', label: 'Consultative' },
] as const

interface TemplateFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  template: CampaignTemplate | null  // null = create mode, set = edit mode
  onSaved: (template: CampaignTemplate) => void
}

const DEFAULT_FORM = {
  name: '',
  channel: 'email' as 'email' | 'sms' | 'both',
  tone_preset: 'professional' as 'professional' | 'friendly' | 'casual' | 'empathetic' | 'direct' | 'authoritative' | 'playful' | 'sincere' | 'nostalgic' | 'consultative',
  tone_custom: '',
  custom_instructions: '',
}

export function TemplateFormDialog({
  open,
  onOpenChange,
  template,
  onSaved,
}: TemplateFormDialogProps) {
  const [form, setForm] = useState(DEFAULT_FORM)
  const [saving, setSaving] = useState(false)
  const isEditing = template !== null

  // Populate form when editing
  useEffect(() => {
    if (template) {
      setForm({
        name: template.name,
        channel: template.channel,
        tone_preset: template.tone_preset,
        tone_custom: template.tone_custom ?? '',
        custom_instructions: template.custom_instructions ?? '',
      })
    } else {
      setForm(DEFAULT_FORM)
    }
  }, [template, open])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)

    const payload = {
      name: form.name.trim(),
      channel: form.channel,
      tone_preset: form.tone_preset,
      tone_custom: form.tone_custom.trim() || null,
      custom_instructions: form.custom_instructions.trim() || null,
    }

    try {
      const url = isEditing
        ? `/api/campaigns/templates/${template!.id}`
        : '/api/campaigns/templates'
      const method = isEditing ? 'PUT' : 'POST'

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const json = await res.json()
      if (!res.ok) {
        toast.error(json.error ?? 'Failed to save template')
        return
      }

      toast.success(isEditing ? 'Template updated' : 'Template created')
      onSaved(json.template)
      onOpenChange(false)
    } catch {
      toast.error('Something went wrong. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>
              {isEditing ? 'Edit template' : 'New template'}
            </DialogTitle>
            <DialogDescription>
              Save a campaign configuration as a reusable template.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Name */}
            <div className="space-y-1.5">
              <Label htmlFor="t-name">Template name *</Label>
              <Input
                id="t-name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Friendly Email + SMS"
                required
                disabled={saving}
              />
            </div>

            {/* Channel */}
            <div className="space-y-1.5">
              <Label>Channel *</Label>
              <Select
                value={form.channel}
                onValueChange={(v) =>
                  setForm((f) => ({ ...f, channel: v as typeof form.channel }))
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CHANNELS.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Tone preset */}
            <div className="space-y-1.5">
              <Label>Tone *</Label>
              <Select
                value={form.tone_preset}
                onValueChange={(v) =>
                  setForm((f) => ({ ...f, tone_preset: v as typeof form.tone_preset }))
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TONE_PRESETS.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Tone custom */}
            <div className="space-y-1.5">
              <Label htmlFor="t-tone-custom">Tone nuance</Label>
              <Input
                id="t-tone-custom"
                value={form.tone_custom}
                onChange={(e) => setForm((f) => ({ ...f, tone_custom: e.target.value }))}
                placeholder='e.g. "slightly humorous", "very direct"'
                disabled={saving}
              />
              <p className="text-xs text-muted-foreground">
                Optional extra tone direction passed to Claude.
              </p>
            </div>

            {/* Custom instructions */}
            <div className="space-y-1.5">
              <Label htmlFor="t-instructions">Custom instructions</Label>
              <Textarea
                id="t-instructions"
                value={form.custom_instructions}
                onChange={(e) =>
                  setForm((f) => ({ ...f, custom_instructions: e.target.value }))
                }
                placeholder='e.g. "mention we offer a free quote", "don&apos;t mention price in Email 1"'
                rows={3}
                disabled={saving}
                className="resize-none"
              />
              <p className="text-xs text-muted-foreground">
                Hard rules Claude must follow when generating sequences.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button type="submit" disabled={saving || !form.name.trim()}>
              {saving && <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />}
              {isEditing ? 'Save changes' : 'Create template'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
