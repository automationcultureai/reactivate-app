'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Loader2 } from 'lucide-react'

interface Campaign {
  id: string
  name: string
  channel: 'email' | 'sms' | 'both'
  tone_preset: string
  tone_custom: string | null
  custom_instructions: string | null
  notify_client: boolean
  send_booking_confirmation: boolean
  send_booking_reminder: boolean
  status: string
}

interface CampaignEditDialogProps {
  campaign: Campaign
  open: boolean
  onOpenChange: (open: boolean) => void
}

const TONE_OPTIONS = [
  { value: 'professional', label: 'Professional' },
  { value: 'friendly', label: 'Friendly' },
  { value: 'casual', label: 'Casual' },
  { value: 'urgent', label: 'Urgent' },
  { value: 'empathetic', label: 'Empathetic' },
]

const CHANNEL_OPTIONS = [
  { value: 'email', label: 'Email only' },
  { value: 'sms', label: 'SMS only' },
  { value: 'both', label: 'Email + SMS' },
]

export function CampaignEditDialog({ campaign, open, onOpenChange }: CampaignEditDialogProps) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    name: campaign.name,
    channel: campaign.channel,
    tone_preset: campaign.tone_preset,
    tone_custom: campaign.tone_custom ?? '',
    custom_instructions: campaign.custom_instructions ?? '',
    notify_client: campaign.notify_client,
    send_booking_confirmation: campaign.send_booking_confirmation,
    send_booking_reminder: campaign.send_booking_reminder,
  })

  const isActive = campaign.status === 'active'

  function set<K extends keyof typeof form>(key: K, value: typeof form[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  async function handleSave() {
    if (!form.name.trim()) { toast.error('Campaign name is required'); return }
    setSaving(true)
    try {
      const payload: Record<string, unknown> = {
        name: form.name.trim(),
        tone_preset: form.tone_preset,
        tone_custom: form.tone_custom.trim() || null,
        custom_instructions: form.custom_instructions.trim() || null,
        notify_client: form.notify_client,
        send_booking_confirmation: form.send_booking_confirmation,
        send_booking_reminder: form.send_booking_reminder,
      }
      if (!isActive) payload.channel = form.channel

      const res = await fetch(`/api/campaigns/${campaign.id}/edit`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (!res.ok) { toast.error(json.error ?? 'Failed to update campaign'); return }
      toast.success('Campaign updated')
      onOpenChange(false)
      router.refresh()
    } catch {
      toast.error('Something went wrong')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit campaign</DialogTitle>
          <DialogDescription>
            Update campaign settings. Changes to tone and instructions apply to future sequence generations only — already-generated emails are not affected.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Name */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Campaign name</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-md border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          {/* Channel */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Channel
              {isActive && <span className="ml-1.5 text-muted-foreground/60">(locked while active)</span>}
            </label>
            <div className="flex gap-2 flex-wrap">
              {CHANNEL_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  disabled={isActive}
                  onClick={() => set('channel', opt.value as typeof form.channel)}
                  className={`px-3 py-1.5 text-xs rounded-md border transition-colors ${
                    form.channel === opt.value
                      ? 'bg-foreground text-background border-foreground'
                      : 'border-border text-muted-foreground hover:text-foreground hover:border-foreground/40'
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Tone preset */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Tone</label>
            <div className="flex gap-2 flex-wrap">
              {TONE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => set('tone_preset', opt.value)}
                  className={`px-3 py-1.5 text-xs rounded-md border transition-colors ${
                    form.tone_preset === opt.value
                      ? 'bg-foreground text-background border-foreground'
                      : 'border-border text-muted-foreground hover:text-foreground hover:border-foreground/40'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Tone custom */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Custom tone modifier <span className="text-muted-foreground/60">(optional)</span></label>
            <input
              type="text"
              placeholder="e.g. avoid jargon, use first names"
              value={form.tone_custom}
              onChange={(e) => set('tone_custom', e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-md border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          {/* Custom instructions */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Custom instructions <span className="text-muted-foreground/60">(optional)</span></label>
            <textarea
              placeholder="Any hard rules Claude must follow when writing for this campaign…"
              value={form.custom_instructions}
              onChange={(e) => set('custom_instructions', e.target.value)}
              rows={3}
              className="w-full px-3 py-2 text-sm rounded-md border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-y"
            />
          </div>

          {/* Toggles */}
          <div className="space-y-2 pt-1">
            <p className="text-xs font-medium text-muted-foreground">Notifications</p>
            {[
              { key: 'notify_client' as const, label: 'Notify client when a lead books' },
              { key: 'send_booking_confirmation' as const, label: 'Send booking confirmation to lead' },
              { key: 'send_booking_reminder' as const, label: 'Send booking reminder to lead' },
            ].map(({ key, label }) => (
              <label key={key} className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form[key]}
                  onChange={(e) => set(key, e.target.checked)}
                  className="w-4 h-4 rounded border-border"
                />
                <span className="text-sm text-foreground">{label}</span>
              </label>
            ))}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />}
            Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
