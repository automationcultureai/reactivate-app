'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Email, Lead, SmsMessage, CampaignAbTest } from '@/lib/supabase'
import { EmailEditor } from '@/components/admin/EmailEditor'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  ChevronDown,
  ChevronRight,
  Send,
  Loader2,
  MessageSquare,
  Mail,
  Layers,
  FlaskConical,
  Sparkles,
  Eye,
} from 'lucide-react'
import { cn } from '@/lib/utils'

export interface LeadPreviewData {
  lead: Lead
  emails: Email[]
  sms: SmsMessage[]
}

interface PreviewListProps {
  campaignId: string
  clientId: string
  channel: 'email' | 'sms' | 'both'
  leads: LeadPreviewData[]
  initialAbTests?: CampaignAbTest[]
}

const BRANCH_TABS = ['unopened', 'opened', 'clicked'] as const
type BranchTab = (typeof BRANCH_TABS)[number]

const BRANCH_TAB_LABELS: Record<BranchTab, string> = {
  unopened: 'Unopened',
  opened: 'Opened',
  clicked: 'Clicked',
}

export function PreviewList({ campaignId, clientId, channel, leads, initialAbTests = [] }: PreviewListProps) {
  const router = useRouter()
  const [expandedLeads, setExpandedLeads] = useState<Set<string>>(new Set())
  const [sending, setSending] = useState(false)

  // Local state for edited email content (emailId → { subject, body })
  const [emailEdits, setEmailEdits] = useState<
    Record<string, { subject: string; body: string }>
  >({})

  // Active branch tab per (leadId, sequenceNumber): key = `${leadId}-${seqNum}`
  const [branchTabs, setBranchTabs] = useState<Record<string, BranchTab>>({})

  // Read-only email preview dialog
  const [viewingEmail, setViewingEmail] = useState<{ subject: string; body: string } | null>(null)

  // A/B generating state per sequence number
  const [abGenerating, setAbGenerating] = useState<Record<number, boolean>>({})

  // A/B test state: seqNum → config
  type AbConfig = { enabled: boolean; variantA: string; variantB: string; saving: boolean }
  const initAbConfig = (): Record<number, AbConfig> => {
    const cfg: Record<number, AbConfig> = {}
    for (const seq of [1, 2, 3, 4]) {
      const existing = initialAbTests.find((t) => t.sequence_number === seq)
      cfg[seq] = {
        enabled: existing?.ab_test_enabled ?? false,
        variantA: existing?.subject_variant_a ?? '',
        variantB: existing?.subject_variant_b ?? '',
        saving: false,
      }
    }
    return cfg
  }
  const [abConfig, setAbConfig] = useState<Record<number, AbConfig>>(initAbConfig)
  // Debounce timers per sequence number
  const abSaveTimers = useRef<Record<number, ReturnType<typeof setTimeout>>>({})

  function updateAbConfig(seqNum: number, patch: Partial<AbConfig>) {
    setAbConfig((prev) => ({ ...prev, [seqNum]: { ...prev[seqNum], ...patch } }))
  }

  async function saveAbConfig(seqNum: number, cfg: AbConfig) {
    updateAbConfig(seqNum, { saving: true })
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/ab-test`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sequence_number: seqNum,
          ab_test_enabled: cfg.enabled,
          subject_variant_a: cfg.variantA || null,
          subject_variant_b: cfg.variantB || null,
        }),
      })
      if (!res.ok) {
        const json = await res.json()
        toast.error(json.error ?? 'Failed to save A/B config')
      }
    } catch {
      toast.error('Failed to save A/B config')
    } finally {
      updateAbConfig(seqNum, { saving: false })
    }
  }

  function scheduleAbSave(seqNum: number, cfg: AbConfig) {
    if (abSaveTimers.current[seqNum]) clearTimeout(abSaveTimers.current[seqNum])
    abSaveTimers.current[seqNum] = setTimeout(() => saveAbConfig(seqNum, cfg), 800)
  }

  function handleAbToggle(seqNum: number, enabled: boolean) {
    const next = { ...abConfig[seqNum], enabled }
    updateAbConfig(seqNum, next)
    scheduleAbSave(seqNum, next)
  }

  function handleAbSubject(seqNum: number, field: 'variantA' | 'variantB', value: string) {
    const next = { ...abConfig[seqNum], [field]: value }
    updateAbConfig(seqNum, next)
    scheduleAbSave(seqNum, next)
  }

  async function handleAbGenerate(seqNum: number) {
    setAbGenerating((prev) => ({ ...prev, [seqNum]: true }))
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/ab-test/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sequence_number: seqNum }),
      })
      const json = await res.json()
      if (!res.ok) {
        toast.error(json.error ?? 'Failed to generate subject lines')
        return
      }
      const next = { ...abConfig[seqNum], variantA: json.variant_a, variantB: json.variant_b }
      updateAbConfig(seqNum, next)
      scheduleAbSave(seqNum, next)
    } catch {
      toast.error('Failed to generate subject lines')
    } finally {
      setAbGenerating((prev) => ({ ...prev, [seqNum]: false }))
    }
  }

  function toggleLead(leadId: string) {
    setExpandedLeads((prev) => {
      const next = new Set(prev)
      if (next.has(leadId)) next.delete(leadId)
      else next.add(leadId)
      return next
    })
  }

  function handleEmailUpdated(emailId: string, subject: string, body: string) {
    setEmailEdits((prev) => ({ ...prev, [emailId]: { subject, body } }))
  }

  function getBranchTab(leadId: string, seqNum: number): BranchTab {
    return branchTabs[`${leadId}-${seqNum}`] ?? 'unopened'
  }

  function setActiveBranchTab(leadId: string, seqNum: number, tab: BranchTab) {
    setBranchTabs((prev) => ({ ...prev, [`${leadId}-${seqNum}`]: tab }))
  }

  async function handleApproveSend() {
    setSending(true)
    const toastId = toast.loading('Approving campaign and sending Email 1…')
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/send`, { method: 'POST' })
      const json = await res.json()
      if (!res.ok) {
        toast.error(json.error ?? 'Send failed', { id: toastId })
        return
      }
      toast.success(
        `Campaign active — ${json.sent ?? 0} email${json.sent !== 1 ? 's' : ''} sent.`,
        { id: toastId }
      )
      router.push(`/admin/clients/${clientId}/campaigns/${campaignId}`)
      router.refresh()
    } catch {
      toast.error('Something went wrong during send.', { id: toastId })
    } finally {
      setSending(false)
    }
  }

  const hasEmail = channel === 'email' || channel === 'both'
  const hasSms = channel === 'sms' || channel === 'both'

  const waveCounts = leads.reduce(
    (acc, { lead }) => {
      const w = lead.rfm_wave ?? 2
      acc[w] = (acc[w] ?? 0) + 1
      return acc
    },
    {} as Record<number, number>
  )
  const hasRfmData = (waveCounts[1] ?? 0) > 0 || (waveCounts[3] ?? 0) > 0

  return (
    <div className="space-y-6">
      {/* Top action bar */}
      <div className="flex items-center justify-between sticky top-0 bg-background/95 backdrop-blur py-3 border-b border-border z-10 -mx-6 px-6">
        <p className="text-sm text-muted-foreground">
          {leads.length} lead{leads.length !== 1 ? 's' : ''} ·{' '}
          {Object.keys(emailEdits).length > 0
            ? `${Object.keys(emailEdits).length} email${Object.keys(emailEdits).length !== 1 ? 's' : ''} edited`
            : 'No edits made'}
        </p>
        <Button onClick={handleApproveSend} disabled={sending}>
          {sending ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Send className="w-4 h-4 mr-2" />
          )}
          {sending ? 'Sending…' : 'Approve & Send'}
        </Button>
      </div>

      {/* A/B subject line testing — email only */}
      {(channel === 'email' || channel === 'both') && (
        <div className="rounded-lg border border-border overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 bg-muted/10 border-b border-border">
            <FlaskConical className="w-3.5 h-3.5 text-muted-foreground" />
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Subject line A/B testing
            </p>
            <p className="text-xs text-muted-foreground ml-1">— toggle per email step to split-test subject lines</p>
          </div>
          <div className="divide-y divide-border">
            {([1, 2, 3, 4] as const).map((seqNum) => {
              const cfg = abConfig[seqNum]
              const seqLabel =
                seqNum === 2 ? 'Email 2 (all variants)' :
                seqNum === 3 ? 'Email 3 (all variants)' :
                `Email ${seqNum}`
              return (
                <div key={seqNum} className="px-4 py-3 space-y-2">
                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={cfg.enabled}
                        onChange={(e) => handleAbToggle(seqNum, e.target.checked)}
                        className="h-3.5 w-3.5 rounded accent-primary"
                      />
                      <span className="text-sm font-medium text-foreground">{seqLabel}</span>
                    </label>
                    {cfg.enabled && (
                      <Badge variant="outline" className="text-xs text-violet-600 dark:text-violet-400 border-violet-500/30">
                        A/B Active
                      </Badge>
                    )}
                    {cfg.enabled && (
                      <button
                        type="button"
                        onClick={() => handleAbGenerate(seqNum)}
                        disabled={abGenerating[seqNum]}
                        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                      >
                        {abGenerating[seqNum] ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <Sparkles className="w-3 h-3" />
                        )}
                        {abGenerating[seqNum] ? 'Generating…' : 'Generate with AI'}
                      </button>
                    )}
                    {cfg.saving && (
                      <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />
                    )}
                  </div>
                  {cfg.enabled && (
                    <div className="grid grid-cols-2 gap-3 pl-5">
                      <div className="space-y-1">
                        <label className="text-xs text-muted-foreground font-medium">Variant A</label>
                        <input
                          type="text"
                          value={cfg.variantA}
                          onChange={(e) => handleAbSubject(seqNum, 'variantA', e.target.value)}
                          placeholder="Subject line A…"
                          className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs text-muted-foreground font-medium">Variant B</label>
                        <input
                          type="text"
                          value={cfg.variantB}
                          onChange={(e) => handleAbSubject(seqNum, 'variantB', e.target.value)}
                          placeholder="Subject line B…"
                          className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring"
                        />
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Wave summary */}
      <div className="flex items-center gap-2 p-3 rounded-lg border border-border bg-muted/10 flex-wrap">
        <Layers className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        {hasRfmData ? (
          <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
            {(waveCounts[1] ?? 0) > 0 && (
              <span>
                <span className="inline-block w-2 h-2 rounded-full bg-green-500 mr-1" />
                Wave 1: <strong className="text-foreground">{waveCounts[1]}</strong> leads (sends Days 1–2)
              </span>
            )}
            {(waveCounts[2] ?? 0) > 0 && (
              <span>
                <span className="inline-block w-2 h-2 rounded-full bg-amber-500 mr-1" />
                Wave 2: <strong className="text-foreground">{waveCounts[2]}</strong> leads (sends Days 3–4)
              </span>
            )}
            {(waveCounts[3] ?? 0) > 0 && (
              <span>
                <span className="inline-block w-2 h-2 rounded-full bg-muted-foreground/60 mr-1" />
                Wave 3: <strong className="text-foreground">{waveCounts[3]}</strong> leads (sends Days 5–6)
              </span>
            )}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            All <strong className="text-foreground">{leads.length}</strong> leads in Wave 2 — no RFM data provided. Email 1 sends Days 3–4 after activation.
          </p>
        )}
      </div>

      {/* Lead rows */}
      <div className="space-y-2">
        {leads.map(({ lead, emails, sms }) => {
          const isExpanded = expandedLeads.has(lead.id)
          const email1 = emails.find((e) => e.sequence_number === 1)
          const isBranched = emails.some((e) => e.branch_variant !== null)

          return (
            <div key={lead.id} className="rounded-lg border border-border overflow-hidden">
              {/* Lead header — always visible */}
              <div className="flex items-center hover:bg-muted/20 transition-colors">
                <button
                  type="button"
                  onClick={() => toggleLead(lead.id)}
                  className="flex-1 flex items-center gap-3 p-4 text-left min-w-0"
                >
                  {isExpanded ? (
                    <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-foreground">{lead.name}</span>
                      {/* Wave badge */}
                      <span className={cn(
                        'text-xs px-1.5 py-0.5 rounded font-medium',
                        (lead.rfm_wave ?? 2) === 1
                          ? 'bg-green-500/10 text-green-700 dark:text-green-400'
                          : (lead.rfm_wave ?? 2) === 3
                          ? 'bg-muted text-muted-foreground'
                          : 'bg-amber-500/10 text-amber-700 dark:text-amber-400'
                      )}>
                        Wave {lead.rfm_wave ?? 2}
                      </span>
                      {hasEmail && (
                        <Badge variant="outline" className="text-xs gap-1">
                          <Mail className="w-2.5 h-2.5" />
                          {emails.length}
                        </Badge>
                      )}
                      {hasSms && (
                        <Badge variant="outline" className="text-xs gap-1">
                          <MessageSquare className="w-2.5 h-2.5" />
                          {sms.length}
                        </Badge>
                      )}
                      {isBranched && (
                        <Badge variant="outline" className="text-xs text-blue-600 dark:text-blue-400 border-blue-500/30">
                          Branched
                        </Badge>
                      )}
                    </div>
                    {email1 && (
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">
                        {emailEdits[email1.id]?.subject ?? email1.subject}
                      </p>
                    )}
                    {!email1 && sms[0] && (
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">
                        {sms[0].body.slice(0, 80)}…
                      </p>
                    )}
                  </div>
                </button>
                {/* View Email 1 button */}
                {email1 && (
                  <button
                    type="button"
                    onClick={() => setViewingEmail({
                      subject: emailEdits[email1.id]?.subject ?? email1.subject,
                      body: emailEdits[email1.id]?.body ?? email1.body,
                    })}
                    className="shrink-0 p-4 text-muted-foreground hover:text-foreground transition-colors"
                    title="Preview Email 1"
                  >
                    <Eye className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* Expanded content */}
              {isExpanded && (
                <div className="border-t border-border p-4 space-y-4 bg-muted/5">
                  {/* Emails */}
                  {hasEmail && emails.length > 0 && (
                    <div className="space-y-3">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                        <Mail className="w-3 h-3" />
                        Email sequence
                      </p>
                      <div className="grid gap-3">
                        {/* Email 1 — always single */}
                        {email1 && (
                          <EmailEditor
                            key={email1.id}
                            emailId={email1.id}
                            campaignId={campaignId}
                            sequenceNumber={1}
                            initialSubject={emailEdits[email1.id]?.subject ?? email1.subject}
                            initialBody={emailEdits[email1.id]?.body ?? email1.body}
                            onUpdated={(subject, body) =>
                              handleEmailUpdated(email1.id, subject, body)
                            }
                            onView={(subject, body) => setViewingEmail({ subject, body })}
                          />
                        )}

                        {/* Email 2 — branched tabs or single */}
                        <BranchedEmailStep
                          leadId={lead.id}
                          seqNum={2}
                          emails={emails}
                          isBranched={isBranched}
                          campaignId={campaignId}
                          emailEdits={emailEdits}
                          activeTab={getBranchTab(lead.id, 2)}
                          onTabChange={(tab) => setActiveBranchTab(lead.id, 2, tab)}
                          onUpdated={handleEmailUpdated}
                          onView={setViewingEmail}
                        />

                        {/* Email 3 — branched tabs or single */}
                        <BranchedEmailStep
                          leadId={lead.id}
                          seqNum={3}
                          emails={emails}
                          isBranched={isBranched}
                          campaignId={campaignId}
                          emailEdits={emailEdits}
                          activeTab={getBranchTab(lead.id, 3)}
                          onTabChange={(tab) => setActiveBranchTab(lead.id, 3, tab)}
                          onUpdated={handleEmailUpdated}
                          onView={setViewingEmail}
                        />

                        {/* Email 4 — always single */}
                        {(() => {
                          const email4 = emails.find(
                            (e) => e.sequence_number === 4 && e.branch_variant === null
                          ) ?? emails.find((e) => e.sequence_number === 4)
                          return email4 ? (
                            <EmailEditor
                              key={email4.id}
                              emailId={email4.id}
                              campaignId={campaignId}
                              sequenceNumber={4}
                              initialSubject={emailEdits[email4.id]?.subject ?? email4.subject}
                              initialBody={emailEdits[email4.id]?.body ?? email4.body}
                              onUpdated={(subject, body) =>
                                handleEmailUpdated(email4.id, subject, body)
                              }
                              onView={(subject, body) => setViewingEmail({ subject, body })}
                            />
                          ) : null
                        })()}
                      </div>
                    </div>
                  )}

                  {/* SMS */}
                  {hasSms && sms.length > 0 && (
                    <>
                      {hasEmail && emails.length > 0 && <Separator />}
                      <div className="space-y-3">
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                          <MessageSquare className="w-3 h-3" />
                          SMS sequence
                        </p>
                        <div className="grid gap-2">
                          {sms
                            .sort((a, b) => a.sequence_number - b.sequence_number)
                            .map((msg) => (
                              <div
                                key={msg.id}
                                className="rounded-md border border-border bg-card p-3 space-y-1"
                              >
                                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                                  SMS {msg.sequence_number}
                                </span>
                                <p className="text-xs text-foreground whitespace-pre-wrap leading-relaxed">
                                  {msg.body}
                                </p>
                                <p className="text-xs text-muted-foreground text-right">
                                  {msg.body.length}/160
                                  {msg.body.length > 160 && (
                                    <span className="text-destructive ml-1">over limit</span>
                                  )}
                                </p>
                              </div>
                            ))}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Bottom action */}
      <div className={cn('flex justify-end pt-4 border-t border-border', leads.length < 5 && 'hidden')}>
        <Button onClick={handleApproveSend} disabled={sending}>
          {sending ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Send className="w-4 h-4 mr-2" />
          )}
          {sending ? 'Sending…' : 'Approve & Send'}
        </Button>
      </div>

      {/* Email preview dialog (read-only) */}
      <Dialog open={!!viewingEmail} onOpenChange={(open) => { if (!open) setViewingEmail(null) }}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold">
              {viewingEmail?.subject}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap pt-2">
            {viewingEmail?.body ?? ''}
          </p>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ─── BranchedEmailStep ───────────────────────────────────────────────────────
// Renders Email 2 or Email 3: either a single EmailEditor (pre-branching
// campaigns) or a 3-tab selector (Unopened / Opened / Clicked).

interface BranchedEmailStepProps {
  leadId: string
  seqNum: 2 | 3
  emails: Email[]
  isBranched: boolean
  campaignId: string
  emailEdits: Record<string, { subject: string; body: string }>
  activeTab: BranchTab
  onTabChange: (tab: BranchTab) => void
  onUpdated: (emailId: string, subject: string, body: string) => void
  onView: (email: { subject: string; body: string }) => void
}

function BranchedEmailStep({
  leadId,
  seqNum,
  emails,
  isBranched,
  campaignId,
  emailEdits,
  activeTab,
  onTabChange,
  onUpdated,
  onView,
}: BranchedEmailStepProps) {
  const variants = emails.filter((e) => e.sequence_number === seqNum)
  if (variants.length === 0) return null

  // Pre-branching campaign or single variant: render as plain EmailEditor
  if (!isBranched || variants.length === 1) {
    const email = variants[0]
    return (
      <EmailEditor
        key={email.id}
        emailId={email.id}
        campaignId={campaignId}
        sequenceNumber={seqNum}
        initialSubject={emailEdits[email.id]?.subject ?? email.subject}
        initialBody={emailEdits[email.id]?.body ?? email.body}
        onUpdated={(subject, body) => onUpdated(email.id, subject, body)}
        onView={(subject, body) => onView({ subject, body })}
      />
    )
  }

  // Branched campaign: 3-tab interface
  const activeVariant = variants.find(
    (e) => e.branch_variant === `${seqNum}_${activeTab}`
  )

  return (
    <div className="rounded-md border border-border overflow-hidden">
      {/* Tab bar */}
      <div className="flex items-center border-b border-border bg-muted/10 px-3 pt-2">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide mr-3 shrink-0">
          Email {seqNum}
        </span>
        {BRANCH_TABS.map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => onTabChange(tab)}
            className={cn(
              'px-3 py-1.5 text-xs font-medium border-b-2 transition-colors',
              activeTab === tab
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            {BRANCH_TAB_LABELS[tab]}
          </button>
        ))}
      </div>

      {/* Active variant */}
      <div className="p-3">
        {activeVariant ? (
          <EmailEditor
            key={`${leadId}-${seqNum}-${activeTab}`}
            emailId={activeVariant.id}
            campaignId={campaignId}
            sequenceNumber={seqNum}
            initialSubject={emailEdits[activeVariant.id]?.subject ?? activeVariant.subject}
            initialBody={emailEdits[activeVariant.id]?.body ?? activeVariant.body}
            onUpdated={(subject, body) => onUpdated(activeVariant.id, subject, body)}
            onView={(subject, body) => onView({ subject, body })}
          />
        ) : (
          <p className="text-xs text-muted-foreground py-2">No variant found.</p>
        )}
      </div>
    </div>
  )
}
