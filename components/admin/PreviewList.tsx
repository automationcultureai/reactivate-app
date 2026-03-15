'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Email, Lead, SmsMessage } from '@/lib/supabase'
import { EmailEditor } from '@/components/admin/EmailEditor'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import {
  ChevronDown,
  ChevronRight,
  Send,
  Loader2,
  MessageSquare,
  Mail,
  Layers,
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
}

export function PreviewList({ campaignId, clientId, channel, leads }: PreviewListProps) {
  const router = useRouter()
  const [expandedLeads, setExpandedLeads] = useState<Set<string>>(new Set())
  const [sending, setSending] = useState(false)

  // Local state for edited email content (emailId → { subject, body })
  const [emailEdits, setEmailEdits] = useState<
    Record<string, { subject: string; body: string }>
  >({})

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

          return (
            <div key={lead.id} className="rounded-lg border border-border overflow-hidden">
              {/* Lead header — always visible */}
              <button
                type="button"
                onClick={() => toggleLead(lead.id)}
                className="w-full flex items-center gap-3 p-4 text-left hover:bg-muted/20 transition-colors"
              >
                {isExpanded ? (
                  <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-foreground">{lead.name}</span>
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
                        {emails
                          .sort((a, b) => a.sequence_number - b.sequence_number)
                          .map((email) => (
                            <EmailEditor
                              key={email.id}
                              emailId={email.id}
                              campaignId={campaignId}
                              sequenceNumber={email.sequence_number}
                              initialSubject={emailEdits[email.id]?.subject ?? email.subject}
                              initialBody={emailEdits[email.id]?.body ?? email.body}
                              onUpdated={(subject, body) =>
                                handleEmailUpdated(email.id, subject, body)
                              }
                            />
                          ))}
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
    </div>
  )
}
