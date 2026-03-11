import Link from 'next/link'
import { getSupabaseClient } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import { buttonVariants } from '@/lib/button-variants'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { MarkPaidButton } from '@/components/admin/MarkPaidButton'
import { Download, AlertCircle, CheckCircle } from 'lucide-react'

export default async function BillingPage() {
  const supabase = getSupabaseClient()

  // Fetch all completed + disputed bookings — include commission_paid_at
  const { data: bookings, error } = await supabase
    .from('bookings')
    .select(`
      id,
      scheduled_at,
      completed_at,
      completed_by,
      commission_owed,
      commission_paid_at,
      status,
      client_id,
      leads(name),
      clients(id, name, business_name, commission_per_job)
    `)
    .in('status', ['completed', 'disputed'])
    .order('completed_at', { ascending: false })

  // Fetch open disputes
  const { data: openDisputes } = await supabase
    .from('commission_disputes')
    .select('booking_id')
    .eq('status', 'open')

  const openDisputeBookingIds = new Set((openDisputes ?? []).map((d) => d.booking_id))

  if (error) {
    return <div className="text-destructive text-sm">Failed to load billing data.</div>
  }

  // Fetch campaigns for send log links
  const { data: campaigns } = await supabase
    .from('campaigns')
    .select('id, name, client_id')
    .order('created_at', { ascending: false })

  // Group by client — split into paid vs unpaid
  type BookingWithMeta = {
    id: string
    scheduled_at: string
    completed_at: string | null
    completed_by: string | null
    commission_owed: number
    commission_paid_at: string | null
    status: string
    leadName: string
  }

  type ClientGroup = {
    clientId: string
    clientName: string
    commissionPerJob: number
    unpaid: BookingWithMeta[]
    paid: BookingWithMeta[]
    disputed: BookingWithMeta[]
    totalUnpaid: number
    totalPaid: number
  }

  const clientMap = new Map<string, ClientGroup>()

  for (const b of bookings ?? []) {
    const client = b.clients as unknown as {
      id: string
      name: string
      business_name: string | null
      commission_per_job: number
    } | null
    const lead = b.leads as unknown as { name: string } | null

    if (!client) continue

    if (!clientMap.has(client.id)) {
      clientMap.set(client.id, {
        clientId: client.id,
        clientName: client.business_name || client.name,
        commissionPerJob: client.commission_per_job,
        unpaid: [],
        paid: [],
        disputed: [],
        totalUnpaid: 0,
        totalPaid: 0,
      })
    }

    const group = clientMap.get(client.id)!
    const row: BookingWithMeta = {
      id: b.id,
      scheduled_at: b.scheduled_at,
      completed_at: b.completed_at,
      completed_by: b.completed_by,
      commission_owed: b.commission_owed,
      commission_paid_at: (b as unknown as { commission_paid_at: string | null }).commission_paid_at,
      status: b.status,
      leadName: lead?.name ?? 'Unknown',
    }

    if (b.status === 'disputed' && openDisputeBookingIds.has(b.id)) {
      group.disputed.push(row)
    } else if (row.commission_paid_at) {
      group.paid.push(row)
      group.totalPaid += b.commission_owed ?? 0
    } else {
      group.unpaid.push(row)
      group.totalUnpaid += b.commission_owed ?? 0
    }
  }

  const clientGroups = Array.from(clientMap.values())
  const grandUnpaid = clientGroups.reduce((sum, g) => sum + g.totalUnpaid, 0)
  const grandPaid = clientGroups.reduce((sum, g) => sum + g.totalPaid, 0)
  const totalDisputedCount = clientGroups.reduce((sum, g) => sum + g.disputed.length, 0)

  const campaignsByClient = new Map<string, typeof campaigns>()
  for (const c of campaigns ?? []) {
    if (!campaignsByClient.has(c.client_id)) campaignsByClient.set(c.client_id, [])
    campaignsByClient.get(c.client_id)!.push(c)
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Billing</h1>
          <div className="flex items-center gap-4 mt-1">
            <p className="text-sm text-muted-foreground">
              Outstanding:{' '}
              <span className="font-semibold text-foreground font-mono">
                ${(grandUnpaid / 100).toFixed(2)}
              </span>
            </p>
            <p className="text-sm text-muted-foreground">
              Total paid:{' '}
              <span className="font-semibold text-green-600 dark:text-green-400 font-mono">
                ${(grandPaid / 100).toFixed(2)}
              </span>
            </p>
            {totalDisputedCount > 0 && (
              <p className="text-sm text-amber-500">
                {totalDisputedCount} disputed
              </p>
            )}
          </div>
        </div>
        <a href="/api/billing/export" className={cn(buttonVariants({ variant: 'outline' }))}>
          <Download className="w-4 h-4 mr-2" />
          Export CSV
        </a>
      </div>

      {/* Platform summary */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Outstanding', value: `$${(grandUnpaid / 100).toFixed(2)}`, sub: 'Commission not yet invoiced', colour: 'text-foreground' },
          { label: 'Total paid', value: `$${(grandPaid / 100).toFixed(2)}`, sub: 'Commission marked as received', colour: 'text-green-600 dark:text-green-400' },
          { label: 'Total earned', value: `$${((grandUnpaid + grandPaid) / 100).toFixed(2)}`, sub: 'All completed jobs', colour: 'text-foreground' },
        ].map(({ label, value, sub, colour }) => (
          <div key={label} className="p-4 rounded-lg border border-border bg-card">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className={cn('text-2xl font-semibold font-mono mt-1', colour)}>{value}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>
          </div>
        ))}
      </div>

      {/* Per-client billing sections */}
      {clientGroups.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 border border-dashed border-border rounded-lg text-center">
          <p className="text-sm text-muted-foreground">No completed jobs yet.</p>
        </div>
      ) : (
        clientGroups.map((group) => {
          const clientCampaigns = campaignsByClient.get(group.clientId) ?? []
          return (
            <div key={group.clientId} className="space-y-3">
              {/* Client header */}
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <h2 className="text-lg font-semibold text-foreground">{group.clientName}</h2>
                  <p className="text-xs text-muted-foreground">
                    ${(group.commissionPerJob / 100).toFixed(2)}/job ·{' '}
                    <span className="font-semibold text-foreground font-mono">
                      ${(group.totalUnpaid / 100).toFixed(2)} outstanding
                    </span>
                    {group.totalPaid > 0 && (
                      <span className="text-green-600 dark:text-green-400 ml-2">
                        · ${(group.totalPaid / 100).toFixed(2)} paid
                      </span>
                    )}
                    {group.disputed.length > 0 && (
                      <span className="text-amber-500 ml-2">
                        · {group.disputed.length} disputed
                      </span>
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <MarkPaidButton clientId={group.clientId} unpaidAmount={group.totalUnpaid} />
                  {clientCampaigns.slice(0, 2).map((c) => (
                    <a
                      key={c.id}
                      href={`/api/billing/send-log/${c.id}`}
                      className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'text-xs')}
                    >
                      <Download className="w-3 h-3 mr-1" />
                      {c.name} log
                    </a>
                  ))}
                </div>
              </div>

              {/* Outstanding bookings */}
              {group.unpaid.length > 0 && (
                <div className="rounded-lg border border-border overflow-hidden">
                  <div className="px-4 py-2 bg-muted/20 border-b border-border">
                    <p className="text-xs font-medium text-muted-foreground">Outstanding — ${(group.totalUnpaid / 100).toFixed(2)}</p>
                  </div>
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/10">
                        <TableHead className="font-medium">Lead</TableHead>
                        <TableHead className="font-medium">Appointment</TableHead>
                        <TableHead className="font-medium">Completed</TableHead>
                        <TableHead className="font-medium">By</TableHead>
                        <TableHead className="font-medium text-right">Commission</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {group.unpaid.map((b) => (
                        <TableRow key={b.id} className="hover:bg-muted/10">
                          <TableCell className="text-foreground">{b.leadName}</TableCell>
                          <TableCell className="text-muted-foreground text-sm">
                            {b.scheduled_at ? new Date(b.scheduled_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
                          </TableCell>
                          <TableCell className="text-muted-foreground text-sm">
                            {b.completed_at ? new Date(b.completed_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
                          </TableCell>
                          <TableCell className="text-muted-foreground text-sm capitalize">{b.completed_by ?? '—'}</TableCell>
                          <TableCell className="text-right font-mono text-sm font-medium">${(b.commission_owed / 100).toFixed(2)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}

              {/* Paid bookings (collapsed summary) */}
              {group.paid.length > 0 && (
                <div className="rounded-lg border border-green-500/20 bg-green-500/5 p-3 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
                    <CheckCircle className="w-4 h-4" />
                    <p className="text-sm font-medium">
                      {group.paid.length} job{group.paid.length !== 1 ? 's' : ''} paid · ${(group.totalPaid / 100).toFixed(2)} received
                    </p>
                  </div>
                  <Badge variant="secondary" className="text-xs text-green-600 dark:text-green-400">Invoiced</Badge>
                </div>
              )}

              {/* Disputed bookings */}
              {group.disputed.length > 0 && (
                <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-4 space-y-2">
                  <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
                    <AlertCircle className="w-4 h-4" />
                    <p className="text-sm font-medium">{group.disputed.length} disputed booking{group.disputed.length !== 1 ? 's' : ''}</p>
                  </div>
                  {group.disputed.map((b) => (
                    <div key={b.id} className="flex items-center justify-between text-sm">
                      <span className="text-foreground">{b.leadName}</span>
                      <div className="flex items-center gap-3">
                        <Badge variant="outline" className="text-xs text-amber-500 border-amber-500/30">Disputed</Badge>
                        <span className="font-mono text-muted-foreground">${(b.commission_owed / 100).toFixed(2)}</span>
                        <Link href="/admin/disputes" className="text-xs text-primary hover:underline">Resolve →</Link>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <Separator />
            </div>
          )
        })
      )}
    </div>
  )
}
