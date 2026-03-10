'use client'

import { useState } from 'react'
import { format, parseISO } from 'date-fns'
import { toast } from 'sonner'
import { Lead, LeadEvent } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
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
import { ChevronDown, ChevronRight, Trash2, Loader2, AlertTriangle } from 'lucide-react'
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

export interface LeadWithEvents extends Lead {
  events: LeadEvent[]
}

interface CampaignLeadListProps {
  leads: LeadWithEvents[]
}

export function CampaignLeadList({ leads: initialLeads }: CampaignLeadListProps) {
  const [leads, setLeads] = useState(initialLeads)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [eraseTarget, setEraseTarget] = useState<LeadWithEvents | null>(null)
  const [erasing, setErasing] = useState(false)

  function toggleExpand(leadId: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(leadId)) next.delete(leadId)
      else next.add(leadId)
      return next
    })
  }

  async function handleErase() {
    if (!eraseTarget) return
    setErasing(true)
    try {
      const res = await fetch(`/api/leads/${eraseTarget.id}/delete`, { method: 'POST' })
      const json = await res.json()
      if (!res.ok) {
        toast.error(json.error ?? 'Erasure failed')
        return
      }
      toast.success('Lead data erased successfully')
      setLeads((prev) =>
        prev.map((l) =>
          l.id === eraseTarget.id
            ? {
                ...l,
                name: 'Deleted User',
                email: 'deleted@deleted.com',
                phone: null,
                status: 'deleted' as Lead['status'],
              }
            : l
        )
      )
      setEraseTarget(null)
    } catch {
      toast.error('Something went wrong')
    } finally {
      setErasing(false)
    }
  }

  return (
    <>
      <div className="rounded-lg border border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30">
              <TableHead className="w-8" />
              <TableHead className="font-medium">Lead</TableHead>
              <TableHead className="font-medium">Status</TableHead>
              <TableHead className="font-medium">Added</TableHead>
              <TableHead className="font-medium">Events</TableHead>
              <TableHead className="w-20" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {leads.map((lead) => {
              const isExpanded = expanded.has(lead.id)
              const badgeClass = STATUS_BADGE[lead.status] ?? 'bg-muted text-muted-foreground'
              const isDeleted = lead.status === 'deleted'

              return (
                <>
                  <TableRow
                    key={lead.id}
                    className={cn('hover:bg-muted/10 cursor-pointer', isDeleted && 'opacity-50')}
                    onClick={() => toggleExpand(lead.id)}
                  >
                    <TableCell className="text-muted-foreground">
                      {isExpanded ? (
                        <ChevronDown className="w-3.5 h-3.5" />
                      ) : (
                        <ChevronRight className="w-3.5 h-3.5" />
                      )}
                    </TableCell>
                    <TableCell className="font-medium text-foreground">{lead.name}</TableCell>
                    <TableCell>
                      <span
                        className={cn(
                          'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize',
                          badgeClass
                        )}
                      >
                        {lead.status.replace(/_/g, ' ')}
                      </span>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {format(parseISO(lead.created_at), 'dd MMM yyyy')}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {lead.events.length} event{lead.events.length !== 1 ? 's' : ''}
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      {!isDeleted && (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={() => setEraseTarget(lead)}
                          title="Erase lead data (GDPR)"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>

                  {/* Expanded event log */}
                  {isExpanded && (
                    <TableRow key={`${lead.id}-events`}>
                      <TableCell colSpan={6} className="bg-muted/10 p-0">
                        {lead.events.length === 0 ? (
                          <p className="text-xs text-muted-foreground px-6 py-3">
                            No events recorded yet.
                          </p>
                        ) : (
                          <div className="px-6 py-3 space-y-1">
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
                      </TableCell>
                    </TableRow>
                  )}
                </>
              )
            })}
          </TableBody>
        </Table>
      </div>

      {/* Erase confirmation dialog */}
      <Dialog open={eraseTarget !== null} onOpenChange={(open) => !open && setEraseTarget(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-destructive" />
              <DialogTitle>Erase lead data</DialogTitle>
            </div>
            <DialogDescription>
              This will anonymise <strong>{eraseTarget?.name}</strong>&apos;s personal data. This
              action is <strong>irreversible</strong>.
            </DialogDescription>
          </DialogHeader>
          <div className="text-sm text-muted-foreground space-y-1">
            <p>The following will be replaced:</p>
            <ul className="list-disc list-inside space-y-0.5 text-xs font-mono">
              <li>name → &quot;Deleted User&quot;</li>
              <li>email → &quot;deleted@deleted.com&quot;</li>
              <li>phone → null</li>
            </ul>
            <p className="text-xs mt-2">
              Booking and commission records are retained for billing purposes.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEraseTarget(null)} disabled={erasing}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleErase} disabled={erasing}>
              {erasing && <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />}
              Erase permanently
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
