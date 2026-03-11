import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getSupabaseClient } from '@/lib/supabase'
import { getAdminUserId } from '@/lib/auth'
import { cn } from '@/lib/utils'
import { Activity, AlertTriangle, TrendingDown } from 'lucide-react'

function tierColour(tier: string) {
  if (tier === 'healthy') return 'text-green-600 dark:text-green-400'
  if (tier === 'moderate') return 'text-amber-600 dark:text-amber-400'
  return 'text-red-600 dark:text-red-400'
}

function tierDotClass(tier: string) {
  if (tier === 'healthy') return 'bg-green-500'
  if (tier === 'moderate') return 'bg-amber-500'
  return 'bg-red-500'
}

export default async function DeliverabilityPage() {
  const adminId = await getAdminUserId()
  if (!adminId) redirect('/sign-in')

  const supabase = getSupabaseClient()

  const { data: clients } = await supabase
    .from('clients')
    .select('id, name, business_name')
    .order('name', { ascending: true })

  if (!clients || clients.length === 0) {
    return (
      <div className="space-y-8">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Deliverability</h1>
          <p className="text-sm text-muted-foreground mt-1">Agency-wide list health scores</p>
        </div>
        <p className="text-sm text-muted-foreground">No clients yet.</p>
      </div>
    )
  }

  const clientIds = clients.map((c) => c.id)

  // Latest aggregate score per client (campaign_id IS NULL)
  const { data: allScores } = await supabase
    .from('list_health_scores')
    .select('client_id, score, tier, bounce_count, unsubscribe_count, recommendations, calculated_at')
    .in('client_id', clientIds)
    .is('campaign_id', null)
    .order('calculated_at', { ascending: false })

  // De-duplicate: keep latest per client
  const latestByClient = new Map<string, {
    score: number
    tier: string
    bounce_count: number
    unsubscribe_count: number
    recommendations: Array<{ trigger: string; message: string }>
  }>()

  for (const s of allScores ?? []) {
    if (!latestByClient.has(s.client_id)) {
      latestByClient.set(s.client_id, {
        score: s.score,
        tier: s.tier,
        bounce_count: s.bounce_count ?? 0,
        unsubscribe_count: s.unsubscribe_count ?? 0,
        recommendations: (s.recommendations as Array<{ trigger: string; message: string }>) ?? [],
      })
    }
  }

  const rows = clients
    .map((c) => ({ ...c, health: latestByClient.get(c.id) ?? null }))
    .sort((a, b) => {
      if (!a.health && !b.health) return 0
      if (!a.health) return 1
      if (!b.health) return -1
      return a.health.score - b.health.score
    })

  const atRiskCount = rows.filter((r) => r.health?.tier === 'at_risk').length
  const totalBounces = rows.reduce((s, r) => s + (r.health?.bounce_count ?? 0), 0)
  const totalUnsubscribes = rows.reduce((s, r) => s + (r.health?.unsubscribe_count ?? 0), 0)

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Deliverability</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Agency-wide list health · clients sorted by score (lowest first)
        </p>
      </div>

      {/* Summary stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {[
          {
            label: 'At-risk clients',
            value: String(atRiskCount),
            icon: AlertTriangle,
            colour: atRiskCount > 0 ? 'text-red-600 dark:text-red-400' : 'text-foreground',
          },
          { label: 'Total send failures', value: String(totalBounces), icon: TrendingDown, colour: '' },
          { label: 'Total unsubscribes', value: String(totalUnsubscribes), icon: Activity, colour: '' },
        ].map(({ label, value, icon: Icon, colour }) => (
          <div key={label} className="p-4 rounded-lg border border-border bg-card">
            <div className="flex items-center gap-2 text-muted-foreground mb-2">
              <Icon className="w-4 h-4" />
              <p className="text-xs">{label}</p>
            </div>
            <p className={cn('text-2xl font-semibold', colour || 'text-foreground')}>{value}</p>
          </div>
        ))}
      </div>

      {/* Client table */}
      <div className="rounded-lg border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/30 border-b border-border">
              <th className="text-left font-medium px-4 py-3 text-muted-foreground">Client</th>
              <th className="text-left font-medium px-4 py-3 text-muted-foreground">Score</th>
              <th className="text-left font-medium px-4 py-3 text-muted-foreground">Tier</th>
              <th className="text-left font-medium px-4 py-3 text-muted-foreground">Failures</th>
              <th className="text-left font-medium px-4 py-3 text-muted-foreground">Unsubscribes</th>
              <th className="text-left font-medium px-4 py-3 text-muted-foreground">Top recommendation</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const rec = row.health?.recommendations?.[0]
              return (
                <tr key={row.id} className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/clients/${row.id}`}
                      className="font-medium text-foreground hover:text-primary transition-colors"
                    >
                      {row.business_name || row.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    {row.health ? (
                      <span className={cn('font-mono font-semibold', tierColour(row.health.tier))}>
                        {row.health.score}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {row.health ? (
                      <span className="flex items-center gap-1.5">
                        <span className={cn('w-2 h-2 rounded-full shrink-0', tierDotClass(row.health.tier))} />
                        <span className="text-xs capitalize">{row.health.tier.replace('_', ' ')}</span>
                      </span>
                    ) : (
                      <span className="text-muted-foreground text-xs">No data yet</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{row.health?.bounce_count ?? '—'}</td>
                  <td className="px-4 py-3 text-muted-foreground">{row.health?.unsubscribe_count ?? '—'}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground max-w-xs truncate">
                    {rec?.message ?? '—'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
