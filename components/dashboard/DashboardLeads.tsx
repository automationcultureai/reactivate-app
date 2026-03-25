import { formatDistanceToNow } from 'date-fns'
import { Lead } from '@/lib/supabase'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { cn } from '@/lib/utils'
import { Users } from 'lucide-react'

const STATUS_BADGE: Record<string, { label: string; classes: string }> = {
  pending: { label: 'Contact made', classes: 'bg-muted text-muted-foreground' },
  emailed: { label: 'Contacted', classes: 'bg-blue-500/10 text-blue-600 dark:text-blue-400' },
  sms_sent: { label: 'Contacted', classes: 'bg-blue-500/10 text-blue-600 dark:text-blue-400' },
  clicked: { label: 'Interested', classes: 'bg-amber-500/10 text-amber-600 dark:text-amber-400' },
  booked: { label: 'Booked', classes: 'bg-green-500/10 text-green-600 dark:text-green-400' },
  completed: { label: 'Completed', classes: 'bg-green-500/10 text-green-600 dark:text-green-400' },
  unsubscribed: { label: 'Opted out', classes: 'bg-muted text-muted-foreground' },
  cancelled: { label: 'Cancelled', classes: 'bg-muted text-muted-foreground' },
  send_failed: { label: 'Send failed', classes: 'bg-destructive/10 text-destructive' },
}

const EVENT_LABELS: Record<string, string> = {
  email_sent: 'Email sent',
  email_opened: 'Email opened',
  sms_sent: 'SMS sent',
  clicked: 'Visited booking page',
  booked: 'Appointment booked',
  completed: 'Job completed',
  unsubscribed: 'Unsubscribed',
  data_erased: 'Data erased',
  booking_cancelled: 'Booking cancelled',
  sms_opted_out: 'SMS opted out',
  auto_completed: 'Auto-completed',
}

const EMAIL_SEQ_LABELS: Record<number, string> = {
  1: 'Email 1 sent — Initial outreach',
  2: 'Email 2 sent — Follow-up',
  3: 'Email 3 sent — Final follow-up',
  4: 'Email 4 sent — Re-engagement',
}

const SMS_SEQ_LABELS: Record<number, string> = {
  1: 'SMS 1 sent — Initial outreach',
  2: 'SMS 2 sent — Follow-up',
  3: 'SMS 3 sent — Final follow-up',
  4: 'SMS 4 sent — Re-engagement',
}

type LeadRow = Pick<Lead, 'id' | 'name' | 'status' | 'created_at'>

interface DashboardLeadsProps {
  leadsByCampaign: { campaignName: string; leads: LeadRow[] }[]
  lastEventByLead: Record<string, { event_type: string; created_at: string }>
  latestEmailByLead: Record<string, { sequence_number: number; sent_at: string }>
  latestSmsByLead: Record<string, { sequence_number: number; sent_at: string }>
}

type LeadRowWithCampaign = LeadRow & { campaignName: string }

function LastAction({
  leadId,
  latestEmailByLead,
  latestSmsByLead,
  lastEventByLead,
}: {
  leadId: string
  latestEmailByLead: Record<string, { sequence_number: number; sent_at: string }>
  latestSmsByLead: Record<string, { sequence_number: number; sent_at: string }>
  lastEventByLead: Record<string, { event_type: string; created_at: string }>
}) {
  const email = latestEmailByLead[leadId]
  const sms = latestSmsByLead[leadId]
  const event = lastEventByLead[leadId]

  if (!email && !sms && !event) {
    return <span className="text-muted-foreground text-sm">No activity yet</span>
  }

  const emailTime = email ? new Date(email.sent_at).getTime() : 0
  const smsTime = sms ? new Date(sms.sent_at).getTime() : 0
  const eventTime = event ? new Date(event.created_at).getTime() : 0
  const mostRecentTime = Math.max(emailTime, smsTime, eventTime)

  if (sms && smsTime === mostRecentTime) {
    return (
      <div>
        <p className="text-sm text-foreground">{SMS_SEQ_LABELS[sms.sequence_number] ?? `SMS ${sms.sequence_number} sent`}</p>
        <p className="text-xs text-muted-foreground">{formatDistanceToNow(new Date(sms.sent_at), { addSuffix: true })}</p>
      </div>
    )
  }

  if (email && emailTime === mostRecentTime) {
    return (
      <div>
        <p className="text-sm text-foreground">{EMAIL_SEQ_LABELS[email.sequence_number] ?? `Email ${email.sequence_number} sent`}</p>
        <p className="text-xs text-muted-foreground">{formatDistanceToNow(new Date(email.sent_at), { addSuffix: true })}</p>
      </div>
    )
  }

  return (
    <div>
      <p className="text-sm text-foreground">{EVENT_LABELS[event!.event_type] ?? event!.event_type}</p>
      <p className="text-xs text-muted-foreground">{formatDistanceToNow(new Date(event!.created_at), { addSuffix: true })}</p>
    </div>
  )
}

export function DashboardLeads({ leadsByCampaign, lastEventByLead, latestEmailByLead, latestSmsByLead }: DashboardLeadsProps) {
  const totalLeads = leadsByCampaign.reduce((s, g) => s + g.leads.length, 0)

  if (totalLeads === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 border border-dashed border-border rounded-lg text-center">
        <Users className="w-7 h-7 text-muted-foreground/30 mb-2" />
        <p className="text-sm text-muted-foreground">No leads yet</p>
      </div>
    )
  }

  const allLeads: LeadRowWithCampaign[] = leadsByCampaign.flatMap(({ campaignName, leads }) =>
    leads.map((lead) => ({ ...lead, campaignName }))
  )

  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/30">
            <TableHead className="font-medium">Name</TableHead>
            <TableHead className="font-medium">Campaign</TableHead>
            <TableHead className="font-medium">Status</TableHead>
            <TableHead className="font-medium">Last action</TableHead>
            <TableHead className="font-medium">Added</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {allLeads.map((lead) => {
            const badge = STATUS_BADGE[lead.status] ?? { label: lead.status, classes: 'bg-muted text-muted-foreground' }
            return (
              <TableRow key={lead.id} className="hover:bg-muted/10">
                <TableCell className="font-medium text-foreground">{lead.name}</TableCell>
                <TableCell>
                  <span className="text-xs text-muted-foreground">{lead.campaignName}</span>
                </TableCell>
                <TableCell>
                  <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium', badge.classes)}>
                    {badge.label}
                  </span>
                </TableCell>
                <TableCell>
                  <LastAction
                    leadId={lead.id}
                    latestEmailByLead={latestEmailByLead}
                    latestSmsByLead={latestSmsByLead}
                    lastEventByLead={lastEventByLead}
                  />
                </TableCell>
                <TableCell className="text-muted-foreground text-sm">
                  {formatDistanceToNow(new Date(lead.created_at), { addSuffix: true })}
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
