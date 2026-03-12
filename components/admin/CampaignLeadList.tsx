'use client'

import { useState } from 'react'
import { format, parseISO } from 'date-fns'
import { toast } from 'sonner'
import { Lead, LeadEvent, Email } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { LeadEditDialog } from '@/components/admin/LeadEditDialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  ChevronDown,
  ChevronRight,
  Trash2,
  Loader2,
  AlertTriangle,
  Pencil,
  Send,
  BellOff,
  Bell,
  Mail,
  CheckCircle,
  Search,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const STATUS_BADGE: Record<string, string> = {
  pending: 'bg-muted text-muted-foreground',
  emailed: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  sms_sent: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  clicked: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  booked: 'bg-green-500/10 text-green-600 dark:text-green-400',
  completed: 'bg-green-500/10 text-green-600 dark:text-green-400',
  unsubscribed: 'bg-muted text-muted-foreground',
  cancelled: 'bg-muted text-muted-foreground',
  send_failed: 'bg-destructive/10 text-destructive',
  deleted: 'bg-muted text-muted-foreground/50',
}

const EVENT_LABELS: Record<string, string> = {
  email_sent: 'Email sent',
  email_opened: 'Email opened',
  sms_sent: 'SMS sent',
  clicked: 'Booking page visited',
  booked: 'Appointment booked',
  completed: 'Job completed',
  unsubscribed: 'Unsubscribed',
  data_erased: 'Data erased',
  booking_cancelled: 'Booking cancelled',
  sms_opted_out: 'SMS opt-out',
  auto_completed: 'Auto-completed',
}

const SEQ_LABELS: Record<number, string> = {
  1: 'Email 1 — Initial',
  2: 'Email 2 — Follow-up',
  3: 'Email 3 — Final follow-up',
  4: 'Email 4 — Re-engagement',
}

export interface LeadWithEvents extends Lead {
  events: LeadEvent[]
  emails?: Email[]
}

interface CampaignLeadListProps {
  leads: LeadWithEvents[]
  campaignId: string
  campaignStatus: string
  clientEmail?: string
  clientBusinessName?: string
  clientBusinessAddress?: string
}

export function CampaignLeadList({
  leads: initialLeads,
  campaignId,
  campaignStatus,
  clientEmail,
  clientBusinessName,
  clientBusinessAddress,
}: CampaignLeadListProps) {
  const [leads, setLeads] = useState(initialLeads)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [eraseTarget, setEraseTarget] = useState<LeadWithEvents | null>(null)
  const [erasing, setErasing] = useState(false)
  const [editTarget, setEditTarget] = useState<LeadWithEvents | null>(null)
  const [sendingNext, setSendingNext] = useState<string | null>(null)
  const [togglingOptOut, setTogglingOptOut] = useState<string | null>(null)
  const [bulkDeleting, setBulkDeleting] = useState(false)
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false)
  const [search, setSearch] = useState('')
  const [editingEmail, setEditingEmail] = useState<{
    emailId: string
    subject: string
    body: string
  } | null>(null)
  const [savingEmail, setSavingEmail] = useState(false)
  const [previewEmail, setPreviewEmail] = useState<{
    label: string
    subject: string
    body: string
  } | null>(null)

  const canSendNext = campaignStatus === 'active' || campaignStatus === 'paused'
  const canEditEmails = ['ready', 'active', 'paused'].includes(campaignStatus)

  const filteredLeads = search.trim()
    ? leads.filter((l) => l.name.toLowerCase().includes(search.trim().toLowerCase()))
    : leads

  const allIds = filteredLeads.filter((l) => l.status !== 'deleted').map((l) => l.id)
  const allSelected = allIds.length > 0 && allIds.every((id) => selected.has(id))

  function toggleExpand(leadId: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(leadId)) next.delete(leadId)
      else next.add(leadId)
      return next
    })
  }

  function toggleSelect(leadId: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(leadId)) next.delete(leadId)
      else next.add(leadId)
      return next
    })
  }

  function toggleSelectAll() {
    if (allSelected) {
      setSelected(new Set())
    } else {
      setSelected(new Set(allIds))
    }
  }

  async function handleErase() {
    if (!eraseTarget) return
    setErasing(true)
    try {
      const res = await fetch(`/api/leads/${eraseTarget.id}/delete`, { method: 'POST' })
      const json = await res.json()
      if (!res.ok) { toast.error(json.error ?? 'Erasure failed'); return }
      toast.success('Lead data erased')
      setLeads((prev) => prev.map((l) => l.id === eraseTarget.id
        ? { ...l, name: 'Deleted User', email: 'deleted@deleted.com', phone: null, status: 'deleted' as Lead['status'] }
        : l
      ))
      setEraseTarget(null)
    } catch { toast.error('Something went wrong') }
    finally { setErasing(false) }
  }

  async function handleBulkDelete() {
    setBulkDeleting(true)
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/leads`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lead_ids: Array.from(selected) }),
      })
      const json = await res.json()
      if (!res.ok) { toast.error(json.error ?? 'Delete failed'); return }
      toast.success(`${json.deleted} leads deleted`)
      setLeads((prev) => prev.map((l) => selected.has(l.id)
        ? { ...l, name: 'Deleted User', email: 'deleted@deleted.com', phone: null, status: 'deleted' as Lead['status'] }
        : l
      ))
      setSelected(new Set())
      setConfirmBulkDelete(false)
    } catch { toast.error('Something went wrong') }
    finally { setBulkDeleting(false) }
  }

  async function handleOptOut(lead: LeadWithEvents) {
    const newOptOut = !lead.email_opt_out
    setTogglingOptOut(lead.id)
    try {
      const res = await fetch(`/api/leads/${lead.id}/opt-out`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email_opt_out: newOptOut }),
      })
      const json = await res.json()
      if (!res.ok) { toast.error(json.error ?? 'Failed'); return }
      toast.success(newOptOut ? 'Lead opted out' : 'Lead re-enabled')
      setLeads((prev) => prev.map((l) => l.id === lead.id
        ? { ...l, email_opt_out: newOptOut, status: newOptOut ? 'unsubscribed' as Lead['status'] : 'pending' as Lead['status'] }
        : l
      ))
    } catch { toast.error('Something went wrong') }
    finally { setTogglingOptOut(null) }
  }

  async function handleSendNext(lead: LeadWithEvents) {
    setSendingNext(lead.id)
    try {
      const res = await fetch(`/api/leads/${lead.id}/send-next`, { method: 'POST' })
      const json = await res.json()
      if (!res.ok) { toast.error(json.error ?? 'Send failed'); return }
      toast.success(`Email ${json.sequence_number} sent to ${lead.name}`)
      // Refresh lead status
      setLeads((prev) => prev.map((l) => l.id === lead.id ? { ...l, status: 'emailed' as Lead['status'] } : l))
    } catch { toast.error('Something went wrong') }
    finally { setSendingNext(null) }
  }

  async function handleSaveEmail() {
    if (!editingEmail) return
    setSavingEmail(true)
    try {
      const res = await fetch(
        `/api/campaigns/${campaignId}/emails/${editingEmail.emailId}/edit`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ subject: editingEmail.subject, body: editingEmail.body }),
        }
      )
      const json = await res.json()
      if (!res.ok) { toast.error(json.error ?? 'Save failed'); return }
      toast.success('Email updated')
      // Update email in local state
      setLeads((prev) =>
        prev.map((l) => ({
          ...l,
          emails: (l.emails ?? []).map((e) =>
            e.id === editingEmail.emailId
              ? { ...e, subject: editingEmail.subject, body: editingEmail.body }
              : e
          ),
        }))
      )
      setEditingEmail(null)
    } catch { toast.error('Something went wrong') }
    finally { setSavingEmail(false) }
  }

  return (
    <>
      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border">
          <span className="text-sm text-foreground font-medium">
            {selected.size} lead{selected.size !== 1 ? 's' : ''} selected
          </span>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setSelected(new Set())}>
              Deselect all
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setConfirmBulkDelete(true)}
            >
              <Trash2 className="w-3.5 h-3.5 mr-1.5" />
              Delete selected
            </Button>
          </div>
        </div>
      )}

      {/* Search bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
        <input
          type="text"
          placeholder="Search leads by name…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-9 pr-8 py-2 text-sm rounded-md border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
        {search && (
          <button
            onClick={() => setSearch('')}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      {search && (
        <p className="text-xs text-muted-foreground -mt-1">
          {filteredLeads.length} of {leads.length} leads
        </p>
      )}

      <div className="rounded-lg border border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30">
              <TableHead className="w-10">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleSelectAll}
                  className="rounded border-border"
                  aria-label="Select all"
                />
              </TableHead>
              <TableHead className="w-6" />
              <TableHead className="font-medium">Lead</TableHead>
              <TableHead className="font-medium">Status</TableHead>
              <TableHead className="font-medium">Added</TableHead>
              <TableHead className="font-medium">Emails</TableHead>
              <TableHead className="w-36" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredLeads.map((lead) => {
              const isExpanded = expanded.has(lead.id)
              const isSelected = selected.has(lead.id)
              const isDeleted = lead.status === 'deleted'
              const badgeClass = STATUS_BADGE[lead.status] ?? 'bg-muted text-muted-foreground'
              const sentEmails = (lead.emails ?? []).filter((e) => e.sent_at)
              const unsentEmails = (lead.emails ?? []).filter((e) => !e.sent_at)
              const nextUnsent = unsentEmails.sort((a, b) => a.sequence_number - b.sequence_number)[0]

              return (
                <>
                  <TableRow
                    key={lead.id}
                    className={cn('hover:bg-muted/10', isDeleted && 'opacity-50', isSelected && 'bg-muted/20')}
                  >
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      {!isDeleted && (
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelect(lead.id)}
                          className="rounded border-border"
                        />
                      )}
                    </TableCell>
                    <TableCell
                      className="text-muted-foreground cursor-pointer"
                      onClick={() => toggleExpand(lead.id)}
                    >
                      {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                    </TableCell>
                    <TableCell
                      className="font-medium text-foreground cursor-pointer"
                      onClick={() => toggleExpand(lead.id)}
                    >
                      <div>
                        <p>{lead.name}</p>
                        {lead.email_opt_out && (
                          <span className="text-xs text-muted-foreground">Opted out</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize', badgeClass)}>
                        {lead.status.replace(/_/g, ' ')}
                      </span>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {format(parseISO(lead.created_at), 'dd MMM yyyy')}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {sentEmails.length}/{(lead.emails ?? []).length} sent
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      {!isDeleted && (
                        <div className="flex items-center gap-0.5">
                          {/* Edit */}
                          <Button
                            variant="ghost" size="icon-sm"
                            onClick={() => setEditTarget(lead)}
                            title="Edit lead"
                          >
                            <Pencil className="w-3 h-3" />
                          </Button>

                          {/* Opt out / re-enable */}
                          <Button
                            variant="ghost" size="icon-sm"
                            onClick={() => handleOptOut(lead)}
                            disabled={togglingOptOut === lead.id}
                            title={lead.email_opt_out ? 'Re-enable emails' : 'Opt out of emails'}
                            className={lead.email_opt_out
                              ? 'text-green-600 hover:text-green-600 hover:bg-green-500/10'
                              : 'text-muted-foreground hover:text-amber-600 hover:bg-amber-500/10'
                            }
                          >
                            {togglingOptOut === lead.id
                              ? <Loader2 className="w-3 h-3 animate-spin" />
                              : lead.email_opt_out
                                ? <Bell className="w-3 h-3" />
                                : <BellOff className="w-3 h-3" />
                            }
                          </Button>

                          {/* Send next email */}
                          {canSendNext && nextUnsent && !lead.email_opt_out && (
                            <Button
                              variant="ghost" size="icon-sm"
                              onClick={() => handleSendNext(lead)}
                              disabled={sendingNext === lead.id}
                              title={`Send Email ${nextUnsent.sequence_number} now`}
                              className="text-blue-600 hover:text-blue-600 hover:bg-blue-500/10"
                            >
                              {sendingNext === lead.id
                                ? <Loader2 className="w-3 h-3 animate-spin" />
                                : <Send className="w-3 h-3" />
                              }
                            </Button>
                          )}

                          {/* Erase */}
                          <Button
                            variant="ghost" size="icon-sm"
                            className="text-destructive hover:text-destructive hover:bg-destructive/10"
                            onClick={() => setEraseTarget(lead)}
                            title="Erase lead data (GDPR)"
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>

                  {/* Expanded: emails + event log */}
                  {isExpanded && (
                    <TableRow key={`${lead.id}-exp`}>
                      <TableCell colSpan={7} className="bg-muted/5 p-0">
                        <div className="px-6 py-4 space-y-4">
                          {/* Emails */}
                          {(lead.emails ?? []).length > 0 && (
                            <div className="space-y-2">
                              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                                <Mail className="w-3 h-3" /> Email sequences
                              </p>
                              <div className="grid gap-2">
                                {(lead.emails ?? [])
                                  .sort((a, b) => a.sequence_number - b.sequence_number)
                                  .map((email) => {
                                    const isEditing = editingEmail?.emailId === email.id
                                    return (
                                      <div key={email.id} className="rounded-md border border-border bg-card p-3 space-y-1.5">
                                        <div className="flex items-center justify-between gap-2">
                                          <span className="text-xs font-medium text-muted-foreground">
                                            {SEQ_LABELS[email.sequence_number] ?? `Email ${email.sequence_number}`}
                                          </span>
                                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                            {email.sent_at && (
                                              <span className="flex items-center gap-1 text-green-600 dark:text-green-400">
                                                <CheckCircle className="w-3 h-3" />
                                                Sent {format(parseISO(email.sent_at), 'dd MMM HH:mm')}
                                              </span>
                                            )}
                                            {email.opened_at && (
                                              <span className="text-blue-500">· Opened</span>
                                            )}
                                            {!email.sent_at && (
                                              <span className="text-muted-foreground/60">Not sent yet</span>
                                            )}
                                            <button
                                              onClick={() => setPreviewEmail({ label: SEQ_LABELS[email.sequence_number] ?? `Email ${email.sequence_number}`, subject: email.subject, body: email.body })}
                                              className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
                                              title="Preview full email"
                                            >
                                              View
                                            </button>
                                            {canEditEmails && (
                                              <button
                                                onClick={() => setEditingEmail({ emailId: email.id, subject: email.subject, body: email.body })}
                                                className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
                                                title="Edit this email"
                                              >
                                                <Pencil className="w-3 h-3" />
                                                Edit
                                              </button>
                                            )}
                                          </div>
                                        </div>
                                        <p className="text-sm font-medium text-foreground">{email.subject}</p>
                                        <p className="text-xs text-muted-foreground whitespace-pre-wrap line-clamp-3">{email.body}</p>
                                      </div>
                                    )
                                  })}
                              </div>
                            </div>
                          )}

                          {/* Event log */}
                          {lead.events.length > 0 && (
                            <div className="space-y-1">
                              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Audit log</p>
                              {lead.events.map((event) => (
                                <div key={event.id} className="flex items-start gap-3 text-xs">
                                  <span className="text-muted-foreground shrink-0 font-mono">
                                    {format(parseISO(event.created_at), 'dd MMM HH:mm')}
                                  </span>
                                  <span className="font-medium text-foreground shrink-0">
                                    {EVENT_LABELS[event.event_type] ?? event.event_type}
                                  </span>
                                  <span className="text-muted-foreground">{event.description}</span>
                                </div>
                              ))}
                            </div>
                          )}

                          {lead.events.length === 0 && (lead.emails ?? []).length === 0 && (
                            <p className="text-xs text-muted-foreground">No activity yet.</p>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </>
              )
            })}
          </TableBody>
        </Table>
      </div>

      {/* Edit lead dialog */}
      {editTarget && (
        <LeadEditDialog
          lead={editTarget as Lead}
          open={editTarget !== null}
          onOpenChange={(open) => !open && setEditTarget(null)}
          onSaved={(updated) => {
            setLeads((prev) => prev.map((l) => l.id === updated.id ? { ...l, ...updated } : l))
            setEditTarget(null)
          }}
        />
      )}

      {/* Erase confirmation */}
      <Dialog open={eraseTarget !== null} onOpenChange={(open) => !open && setEraseTarget(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-destructive" />
              <DialogTitle>Erase lead data</DialogTitle>
            </div>
            <DialogDescription>
              Anonymise <strong>{eraseTarget?.name}</strong>&apos;s personal data — irreversible.
            </DialogDescription>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">Booking records are retained for billing.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEraseTarget(null)} disabled={erasing}>Cancel</Button>
            <Button variant="destructive" onClick={handleErase} disabled={erasing}>
              {erasing && <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />}
              Erase permanently
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Email edit dialog */}
      <Dialog open={editingEmail !== null} onOpenChange={(open) => !open && setEditingEmail(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit email</DialogTitle>
            <DialogDescription>
              Changes apply to this lead&apos;s unsent copy. Already-sent emails are unaffected.
            </DialogDescription>
          </DialogHeader>
          {editingEmail && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Subject</label>
                <input
                  type="text"
                  value={editingEmail.subject}
                  onChange={(e) => setEditingEmail((prev) => prev ? { ...prev, subject: e.target.value } : prev)}
                  className="w-full px-3 py-2 text-sm rounded-md border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Body</label>
                <textarea
                  value={editingEmail.body}
                  onChange={(e) => setEditingEmail((prev) => prev ? { ...prev, body: e.target.value } : prev)}
                  rows={14}
                  className="w-full px-3 py-2 text-sm rounded-md border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-y font-mono"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingEmail(null)} disabled={savingEmail}>
              Cancel
            </Button>
            <Button onClick={handleSaveEmail} disabled={savingEmail}>
              {savingEmail && <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />}
              Save changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Email preview dialog */}
      <Dialog open={previewEmail !== null} onOpenChange={(open) => !open && setPreviewEmail(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{previewEmail?.label}</DialogTitle>
            <DialogDescription className="font-medium text-foreground">
              {previewEmail?.subject}
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto rounded-md border border-border bg-muted/20 px-4 py-3">
            <p className="text-sm text-foreground whitespace-pre-wrap font-mono leading-relaxed">
              {previewEmail?.body}
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPreviewEmail(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk delete confirmation */}
      <Dialog open={confirmBulkDelete} onOpenChange={setConfirmBulkDelete}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete {selected.size} leads?</DialogTitle>
            <DialogDescription>
              This will anonymise their personal data. Booking records are retained.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmBulkDelete(false)} disabled={bulkDeleting}>Cancel</Button>
            <Button variant="destructive" onClick={handleBulkDelete} disabled={bulkDeleting}>
              {bulkDeleting && <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />}
              Delete {selected.size} leads
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
