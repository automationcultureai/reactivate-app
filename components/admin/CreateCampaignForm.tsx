'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { CampaignTemplate } from '@/lib/supabase'
import { CsvParseResult } from '@/lib/csv'
import { CsvUploader } from '@/components/admin/CsvUploader'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Loader2, AlertTriangle } from 'lucide-react'

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

const CHANNELS = [
  { value: 'email', label: 'Email only' },
  { value: 'sms', label: 'SMS only' },
  { value: 'both', label: 'Email + SMS' },
] as const

const CONSENT_OPTIONS = [
  'Previous customer',
  'Quote/enquiry requested',
  'Service subscriber',
  'Other',
] as const

type TonePreset = (typeof TONE_PRESETS)[number]['value']
type Channel = (typeof CHANNELS)[number]['value']
type ConsentBasis = (typeof CONSENT_OPTIONS)[number]

interface CreateCampaignFormProps {
  clientId: string
  templates: CampaignTemplate[]
}

export function CreateCampaignForm({ clientId, templates }: CreateCampaignFormProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [csvResult, setCsvResult] = useState<CsvParseResult | null>(null)

  // Duplicate confirmation dialog
  const [duplicateDialog, setDuplicateDialog] = useState<{
    open: boolean
    count: number
    message: string
  }>({ open: false, count: 0, message: '' })

  const [form, setForm] = useState({
    name: '',
    template_id: '',
    channel: 'email' as Channel,
    tone_preset: 'professional' as TonePreset,
    tone_custom: '',
    custom_instructions: '',
    consent_basis: 'Previous customer' as ConsentBasis,
    notify_client: true,
    send_booking_confirmation: true,
    send_booking_reminder: true,
    external_booking_url: '',
  })

  function applyTemplate(templateId: string) {
    const tpl = templates.find((t) => t.id === templateId)
    if (!tpl) return
    setForm((f) => ({
      ...f,
      template_id: templateId,
      channel: tpl.channel,
      tone_preset: tpl.tone_preset,
      tone_custom: tpl.tone_custom ?? '',
      custom_instructions: tpl.custom_instructions ?? '',
    }))
  }

  async function submitCampaign(confirmDuplicates = false) {
    if (!csvResult || csvResult.leads.length === 0) {
      toast.error('Please upload a CSV with at least one valid lead.')
      return
    }

    setLoading(true)
    try {
      const payload = {
        client_id: clientId,
        name: form.name.trim(),
        channel: form.channel,
        tone_preset: form.tone_preset,
        tone_custom: form.tone_custom.trim() || null,
        custom_instructions: form.custom_instructions.trim() || null,
        consent_basis: form.consent_basis,
        template_id: form.template_id || null,
        notify_client: form.notify_client,
        send_booking_confirmation: form.send_booking_confirmation,
        send_booking_reminder: form.send_booking_reminder,
        external_booking_url: form.external_booking_url.trim() || null,
        leads: csvResult.leads,
        confirm_duplicates: confirmDuplicates,
      }

      const res = await fetch('/api/campaigns/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const json = await res.json()

      if (!res.ok) {
        toast.error(json.error ?? 'Failed to create campaign')
        return
      }

      // Duplicate warning — requires confirmation
      if (json.requires_confirmation) {
        setDuplicateDialog({
          open: true,
          count: json.duplicate_count,
          message: json.message,
        })
        return
      }

      toast.success(`Campaign created with ${json.lead_count} leads`)
      router.push(`/admin/clients/${clientId}/campaigns/${json.campaign_id}`)
      router.refresh()
    } catch {
      toast.error('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  async function handleConfirmDuplicates() {
    setDuplicateDialog((d) => ({ ...d, open: false }))
    await submitCampaign(true)
  }

  const canSubmit = form.name.trim() && csvResult && csvResult.leads.length > 0 && !loading

  return (
    <>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          submitCampaign(false)
        }}
        className="space-y-6 max-w-2xl"
      >
        {/* Campaign details */}
        <Card>
          <CardHeader>
            <CardTitle>Campaign details</CardTitle>
            <CardDescription>Name this campaign and optionally load a template.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="c-name">Campaign name *</Label>
              <Input
                id="c-name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Jan 2025 Reactivation"
                required
                disabled={loading}
              />
            </div>

            {templates.length > 0 && (
              <div className="space-y-1.5">
                <Label>Load template</Label>
                <Select
                  value={form.template_id}
                  onValueChange={(v) => v && applyTemplate(v)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="No template (fill fields manually)" />
                  </SelectTrigger>
                  <SelectContent>
                    {templates.map((tpl) => (
                      <SelectItem key={tpl.id} value={tpl.id}>
                        {tpl.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Selecting a template pre-fills channel, tone, and instructions below.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Channel + Tone */}
        <Card>
          <CardHeader>
            <CardTitle>Channel &amp; tone</CardTitle>
            <CardDescription>
              Choose how to reach leads and the voice Claude should use.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label>Channel *</Label>
              <Select
                value={form.channel}
                onValueChange={(v) => setForm((f) => ({ ...f, channel: v as Channel }))}
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

            <div className="space-y-1.5">
              <Label>Tone preset *</Label>
              <Select
                value={form.tone_preset}
                onValueChange={(v) => setForm((f) => ({ ...f, tone_preset: v as TonePreset }))}
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

            <div className="space-y-1.5">
              <Label htmlFor="c-tone-custom">Tone nuance</Label>
              <Input
                id="c-tone-custom"
                value={form.tone_custom}
                onChange={(e) => setForm((f) => ({ ...f, tone_custom: e.target.value }))}
                placeholder='e.g. "slightly humorous", "very direct"'
                disabled={loading}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="c-instructions">Custom instructions</Label>
              <Textarea
                id="c-instructions"
                value={form.custom_instructions}
                onChange={(e) => setForm((f) => ({ ...f, custom_instructions: e.target.value }))}
                placeholder='e.g. "mention we offer a free quote", "don&apos;t mention price in Email 1"'
                rows={3}
                disabled={loading}
                className="resize-none"
              />
              <p className="text-xs text-muted-foreground">
                Hard rules Claude must follow when generating sequences.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label>Consent basis *</Label>
              <Select
                value={form.consent_basis}
                onValueChange={(v) =>
                  setForm((f) => ({ ...f, consent_basis: v as ConsentBasis }))
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CONSENT_OPTIONS.map((opt) => (
                    <SelectItem key={opt} value={opt}>
                      {opt}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Legal basis for contacting these leads — stored per campaign.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Settings (toggles) */}
        <Card>
          <CardHeader>
            <CardTitle>Notifications &amp; reminders</CardTitle>
            <CardDescription>
              Control automatic emails sent to leads and clients.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {[
              {
                key: 'notify_client' as const,
                label: 'Notify client on new booking',
                description: 'Email sent to the client when a lead books an appointment.',
              },
              {
                key: 'send_booking_confirmation' as const,
                label: 'Send booking confirmation to lead',
                description: 'Confirmation email sent to the lead immediately after booking.',
              },
              {
                key: 'send_booking_reminder' as const,
                label: 'Send booking reminder to lead',
                description: 'Reminder sent to the lead before their scheduled appointment.',
              },
            ].map(({ key, label, description }) => (
              <div key={key} className="flex items-center justify-between gap-4">
                <div className="space-y-0.5">
                  <p className="text-sm font-medium text-foreground">{label}</p>
                  <p className="text-xs text-muted-foreground">{description}</p>
                </div>
                <Switch
                  checked={form[key]}
                  onCheckedChange={(checked) => setForm((f) => ({ ...f, [key]: checked }))}
                  disabled={loading}
                />
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Booking destination */}
        <Card>
          <CardHeader>
            <CardTitle>Booking destination</CardTitle>
            <CardDescription>
              Where should leads be sent when they click your campaign link?
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="space-y-1.5">
              <Label htmlFor="c-booking-url">External booking URL</Label>
              <Input
                id="c-booking-url"
                type="url"
                value={form.external_booking_url}
                onChange={(e) => setForm((f) => ({ ...f, external_booking_url: e.target.value }))}
                placeholder="https://book.mindbody.com/... or leave blank to use built-in booking"
                disabled={loading}
              />
              <p className="text-xs text-muted-foreground">
                Paste your Mindbody, Acuity, or Vagaro booking link. Leave blank to use
                Reactivate&apos;s built-in calendar.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* CSV Upload */}
        <Card>
          <CardHeader>
            <CardTitle>Upload leads</CardTitle>
            <CardDescription>
              Upload a CSV of dormant leads. The file is validated immediately — no data is sent
              until you click Create.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <CsvUploader channel={form.channel} onParsed={setCsvResult} />
          </CardContent>
        </Card>

        <div className="flex items-center gap-3">
          <Button type="submit" disabled={!canSubmit}>
            {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {csvResult
              ? `Create campaign with ${csvResult.leads.length} leads`
              : 'Create campaign'}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => router.back()}
            disabled={loading}
          >
            Cancel
          </Button>
        </div>
      </form>

      {/* Duplicate confirmation dialog */}
      <Dialog
        open={duplicateDialog.open}
        onOpenChange={(open) => setDuplicateDialog((d) => ({ ...d, open }))}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              <DialogTitle>Duplicate leads detected</DialogTitle>
            </div>
            <DialogDescription>{duplicateDialog.message}</DialogDescription>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            These leads are already in an active campaign for this client. You can skip them
            (they will still be added) or cancel and clean your CSV.
          </p>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDuplicateDialog((d) => ({ ...d, open: false }))}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button onClick={handleConfirmDuplicates} disabled={loading}>
              {loading && <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />}
              Continue anyway
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
