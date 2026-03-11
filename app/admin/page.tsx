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
import { ArrowRight, Users, BarChart3, DollarSign, Calendar, CheckCircle, XCircle } from 'lucide-react'

function pct(num: number, denom: number): string {
  if (!denom) return '—'
  return `${Math.round((num / denom) * 100)}%`
}

export default async function AdminHomePage() {
  const supabase = getSupabaseClient()

  const [
    { count: totalClients },
    { count: totalLeads },
    { count: activeBookings },
    { count: totalCompleted },
    { count: totalCancelled },
  ] = await Promise.all([
    supabase.from('clients').select('id', { count: 'exact', head: true }),
    supabase.from('leads').select('id', { count: 'exact', head: true }),
    supabase.from('bookings').select('id', { count: 'exact', head: true }).eq('status', 'booked'),
    supabase.from('bookings').select('id', { count: 'exact', head: true }).eq('status', 'completed'),
    supabase.from('bookings').select('id', { count: 'exact', head: true }).eq('status', 'cancelled'),
  ])

  const { data: commissionData } = await supabase
    .from('bookings')
    .select('commission_owed, commission_paid_at')
    .in('status', ['completed', 'disputed'])

  const totalOutstanding = (commissionData ?? [])
    .filter((b) => !(b as { commission_paid_at: string | null }).commission_paid_at)
    .reduce((sum, b) => sum + (b.commission_owed ?? 0), 0)
  const totalPaid = (commissionData ?? [])
    .filter((b) => !!(b as { commission_paid_at: string | null }).commission_paid_at)
    .reduce((sum, b) => sum + (b.commission_owed ?? 0), 0)

  const { data: clients } = await supabase
    .from('clients')
    .select('id, name, business_name, commission_per_job')
    .order('created_at', { ascending: false })

  // Latest aggregate health score per client
  const clientIdList = (clients ?? []).map((c) => c.id)
  const { data: allHealthScores } = clientIdList.length > 0
    ? await supabase
        .from('list_health_scores')
        .select('client_id, score, tier, calculated_at')
        .in('client_id', clientIdList)
        .is('campaign_id', null)
        .order('calculated_at', { ascending: false })
    : { data: [] }

  const latestHealthByClient = new Map<string, { score: number; tier: string }>()
  for (const h of allHealthScores ?? []) {
    if (!latestHealthByClient.has(h.client_id)) {
      latestHealthByClient.set(h.client_id, { score: h.score, tier: h.tier })
    }
  }

  const clientStats = await Promise.all(
    (clients ?? []).map(async (client: { id: string; name: string; business_name: string | null; commission_per_job: number }) => {
      const [
        { count: campaigns },
        { count: activeCampaigns },
        { count: leads },
        { count: completed },
        { data: commissions },
      ] = await Promise.all([
        supabase.from('campaigns').select('id', { count: 'exact', head: true }).eq('client_id', client.id),
        supabase.from('campaigns').select('id', { count: 'exact', head: true }).eq('client_id', client.id).eq('status', 'active'),
        supabase.from('leads').select('id', { count: 'exact', head: true }).eq('client_id', client.id),
        supabase.from('bookings').select('id', { count: 'exact', head: true }).eq('client_id', client.id).eq('status', 'completed'),
        supabase.from('bookings').select('commission_owed').eq('client_id', client.id).in('status', ['completed', 'disputed']),
      ])

      const totalOwed = (commissions ?? []).reduce((s, b) => s + (b.commission_owed ?? 0), 0)

      return {
        ...client,
        campaigns: campaigns ?? 0,
        activeCampaigns: activeCampaigns ?? 0,
        leads: leads ?? 0,
        completed: completed ?? 0,
        commissionOwed: totalOwed,
        health: latestHealthByClient.get(client.id) ?? null,
      }
    })
  )

  const stats = [
    { label: 'Clients', value: String(totalClients ?? 0), icon: Users, colour: '' },
    { label: 'Total leads', value: String(totalLeads ?? 0), icon: BarChart3, colour: '' },
    { label: 'Active bookings', value: String(activeBookings ?? 0), icon: Calendar, colour: 'text-blue-600 dark:text-blue-400' },
    { label: 'Jobs completed', value: String(totalCompleted ?? 0), icon: CheckCircle, colour: 'text-green-600 dark:text-green-400' },
    { label: 'Bookings cancelled', value: String(totalCancelled ?? 0), icon: XCircle, colour: 'text-muted-foreground' },
    { label: 'Outstanding', value: `$${(totalOutstanding / 100).toFixed(2)}`, icon: DollarSign, colour: 'text-amber-600 dark:text-amber-400' },
    { label: 'Total paid', value: `$${(totalPaid / 100).toFixed(2)}`, icon: DollarSign, colour: 'text-green-600 dark:text-green-400' },
  ]

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Platform overview · {totalCompleted ?? 0} jobs completed
          </p>
        </div>
        <Link href="/admin/clients/new" className={cn(buttonVariants())}>
          Add client
        </Link>
      </div>

      {/* Platform stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {stats.map(({ label, value, icon: Icon, colour }) => (
          <div key={label} className="p-4 rounded-lg border border-border bg-card">
            <div className="flex items-center gap-2 text-muted-foreground mb-2">
              <Icon className="w-4 h-4" />
              <p className="text-xs">{label}</p>
            </div>
            <p className={cn('text-2xl font-semibold', colour || 'text-foreground')}>{value}</p>
          </div>
        ))}
      </div>

      {/* Client list */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold text-foreground">Clients</h2>

        {clientStats.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 border border-dashed border-border rounded-lg text-center">
            <p className="text-sm font-medium text-foreground">No clients yet</p>
            <p className="text-xs text-muted-foreground mt-1">Add your first client to get started.</p>
            <Link href="/admin/clients/new" className={cn(buttonVariants(), 'mt-4')}>
              Add client
            </Link>
          </div>
        ) : (
          <div className="rounded-lg border border-border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30">
                  <TableHead className="font-medium">Client</TableHead>
                  <TableHead className="font-medium">Campaigns</TableHead>
                  <TableHead className="font-medium">Leads</TableHead>
                  <TableHead className="font-medium">Completed</TableHead>
                  <TableHead className="font-medium">Conv. rate</TableHead>
                  <TableHead className="font-medium">Commission owed</TableHead>
                  <TableHead className="font-medium">Health</TableHead>
                  <TableHead className="w-16" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {clientStats.map((client) => (
                  <TableRow key={client.id} className="hover:bg-muted/20 transition-colors group">
                    <TableCell>
                      <Link href={`/admin/clients/${client.id}`} className="block">
                        <p className="font-medium text-foreground group-hover:text-primary transition-colors">
                          {client.business_name || client.name}
                        </p>
                        {client.activeCampaigns > 0 && (
                          <Badge variant="secondary" className="text-xs mt-0.5">
                            {client.activeCampaigns} active
                          </Badge>
                        )}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{client.campaigns}</TableCell>
                    <TableCell className="text-muted-foreground">{client.leads}</TableCell>
                    <TableCell className="text-muted-foreground">{client.completed}</TableCell>
                    <TableCell className="font-mono text-sm">
                      {pct(client.completed, client.leads)}
                    </TableCell>
                    <TableCell className="font-mono text-sm text-foreground">
                      ${(client.commissionOwed / 100).toFixed(2)}
                    </TableCell>
                    <TableCell>
                      {client.health ? (
                        <span className="flex items-center gap-1.5">
                          <span className={cn(
                            'w-2 h-2 rounded-full shrink-0',
                            client.health.tier === 'healthy' ? 'bg-green-500' :
                            client.health.tier === 'moderate' ? 'bg-amber-500' : 'bg-red-500'
                          )} />
                          <span className={cn(
                            'text-xs font-mono font-semibold',
                            client.health.tier === 'healthy' ? 'text-green-600 dark:text-green-400' :
                            client.health.tier === 'moderate' ? 'text-amber-600 dark:text-amber-400' :
                            'text-red-600 dark:text-red-400'
                          )}>
                            {client.health.score}
                          </span>
                        </span>
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </TableCell>
                    <TableCell className="pr-2">
                      <Link
                        href={`/admin/clients/${client.id}`}
                        className={cn(
                          buttonVariants({ variant: 'ghost', size: 'sm' }),
                          'w-full flex items-center justify-center gap-1 text-muted-foreground'
                        )}
                      >
                        <ArrowRight className="w-4 h-4" />
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  )
}
