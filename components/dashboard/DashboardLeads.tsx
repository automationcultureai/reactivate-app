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

interface DashboardLeadsProps {
  leads: Pick<Lead, 'id' | 'name' | 'status' | 'created_at'>[]
}

export function DashboardLeads({ leads }: DashboardLeadsProps) {
  if (leads.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 border border-dashed border-border rounded-lg text-center">
        <Users className="w-7 h-7 text-muted-foreground/30 mb-2" />
        <p className="text-sm text-muted-foreground">No leads yet</p>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/30">
            <TableHead className="font-medium">Name</TableHead>
            <TableHead className="font-medium">Status</TableHead>
            <TableHead className="font-medium">Added</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {leads.map((lead) => {
            const badge = STATUS_BADGE[lead.status] ?? {
              label: lead.status,
              classes: 'bg-muted text-muted-foreground',
            }
            return (
              <TableRow key={lead.id} className="hover:bg-muted/10">
                <TableCell className="font-medium text-foreground">{lead.name}</TableCell>
                <TableCell>
                  <span
                    className={cn(
                      'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium',
                      badge.classes
                    )}
                  >
                    {badge.label}
                  </span>
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
