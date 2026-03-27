import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getSupabaseClient } from '@/lib/supabase'
import { ClientDetailHeader } from '@/components/admin/ClientDetailHeader'
import { ClientNotesEditor } from '@/components/admin/ClientNotesEditor'
import { ClientIndustrySelect } from '@/components/admin/ClientIndustrySelect'
import { HealthSparkline } from '@/components/admin/HealthSparkline'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { buttonVariants } from '@/lib/button-variants'
import { ChevronLeft, FileText } from 'lucide-react'
import { Separator } from '@/components/ui/separator'

interface Props {
  params: Promise<{ clientId: string }>
  searchParams: Promise<{ archived?: string }>
}

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

export default async function ClientDetailPage({ params, searchParams }: Props) {
  const { clientId } = await params
  const { archived } = await searchParams
  const showArchived = archived === '1'
  const supabase = getSupabaseClient()

  const { data: client, error } = await supabase
    .from('clients')
    .select('*')
    .eq('id', clientId)
    .single()

  if (error || !client) {
    notFound()
  }

  // Campaigns for this client (hide archived by default)
  const baseQuery = supabase
    .from('campaigns')
    .select('id, name, status, created_at, channel, deleted_at')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })

  let { data: campaigns, error: campaignError } = await (
    showArchived ? baseQuery : baseQuery.is('deleted_at', null)
  )

  // If deleted_at column doesn't exist yet (migration pending), fall back to unfiltered
  if (campaignError) {
    const { data: fallback } = await supabase
      .from('campaigns')
      .select('id, name, status, created_at, channel')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false })
    campaigns = (fallback ?? []).map((c) => ({ ...c, deleted_at: null }))
  }

  // Count archived campaigns for the toggle
  const { count: archivedCount } = await supabase
    .from('campaigns')
    .select('id', { count: 'exact', head: true })
    .eq('client_id', clientId)
    .not('deleted_at', 'is', null)

  // Latest aggregate health score (campaign_id IS NULL = client aggregate)
  const { data: healthRows } = await supabase
    .from('list_health_scores')
    .select('score, tier, bounce_count, unsubscribe_count, open_rate, click_rate, recommendations, calculated_at')
    .eq('client_id', clientId)
    .is('campaign_id', null)
    .order('calculated_at', { ascending: false })
    .limit(30)

  const latestHealth = healthRows?.[0] ?? null

  // 30-day sparkline (reverse so oldest is leftmost)
  const sparklineData = (healthRows ?? [])
    .slice(0, 30)
    .reverse()
    .map((r) => ({
      date: new Date(r.calculated_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }),
      score: r.score,
    }))

  const recommendations =
    (latestHealth?.recommendations as Array<{ trigger: string; message: string }> | null) ?? []

  return (
    <div className="space-y-8">
      {/* Back navigation */}
      <div className="flex items-center gap-2">
        <Link
          href="/admin/clients"
          className={cn(buttonVariants({ variant: 'ghost', size: 'icon' }))}
        >
          <ChevronLeft className="w-4 h-4" />
        </Link>
        <span className="text-sm text-muted-foreground">All clients</span>
      </div>

      {/* Client header */}
      <ClientDetailHeader client={client} />

      <Separator />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left column: campaigns + health */}
        <div className="lg:col-span-2 space-y-8">
          {/* Campaigns */}
          <div className="space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h2 className="text-lg font-semibold text-foreground">Campaigns</h2>
              <div className="flex items-center gap-2">
                {(archivedCount ?? 0) > 0 && (
                  <Link
                    href={showArchived ? `/admin/clients/${clientId}` : `/admin/clients/${clientId}?archived=1`}
                    className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'text-xs text-muted-foreground')}
                  >
                    {showArchived ? 'Hide archived' : `Show archived (${archivedCount})`}
                  </Link>
                )}
                <Link
                  href={`/admin/clients/${clientId}/campaigns/new`}
                  className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
                >
                  New campaign
                </Link>
              </div>
            </div>

            {!campaigns || campaigns.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 border border-dashed border-border rounded-lg text-center">
                <FileText className="w-8 h-8 text-muted-foreground/40 mb-3" />
                <p className="text-sm font-medium text-foreground">No campaigns yet</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Create a campaign to start sending reactivation messages.
                </p>
                <Link
                  href={`/admin/clients/${clientId}/campaigns/new`}
                  className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'mt-4')}
                >
                  Create first campaign
                </Link>
              </div>
            ) : (
              <div className="space-y-2">
                {campaigns.map((campaign) => (
                  <Link
                    key={campaign.id}
                    href={`/admin/clients/${clientId}/campaigns/${campaign.id}`}
                    className="flex items-center justify-between p-4 rounded-lg border border-border hover:bg-muted/20 transition-colors group"
                  >
                    <div>
                      <p className="text-sm font-medium text-foreground group-hover:text-primary transition-colors">
                        {campaign.name}
                      </p>
                      <p className="text-xs text-muted-foreground capitalize">
                        {campaign.channel === 'both' ? 'Email + SMS' : campaign.channel} · {(campaign as { deleted_at?: string | null }).deleted_at ? 'archived' : campaign.status}
                      </p>
                    </div>
                    <ChevronLeft className="w-4 h-4 text-muted-foreground rotate-180" />
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* List Health */}
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-foreground">List Health</h2>

            {!latestHealth ? (
              <div className="p-4 rounded-lg border border-border text-sm text-muted-foreground">
                No health data yet. Scores are calculated nightly once campaigns have sent emails.
              </div>
            ) : (
              <div className="rounded-lg border border-border p-5 space-y-5">
                {/* Score + tier */}
                <div className="flex items-center gap-4">
                  <p className={cn('text-4xl font-semibold font-mono', tierColour(latestHealth.tier))}>
                    {latestHealth.score}
                  </p>
                  <div className="space-y-0.5">
                    <span className="flex items-center gap-1.5">
                      <span className={cn('w-2 h-2 rounded-full', tierDotClass(latestHealth.tier))} />
                      <span className="text-sm font-medium capitalize">
                        {latestHealth.tier.replace('_', ' ')}
                      </span>
                    </span>
                    <p className="text-xs text-muted-foreground">
                      Last calculated{' '}
                      {new Date(latestHealth.calculated_at).toLocaleDateString('en-AU', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </p>
                  </div>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {[
                    { label: 'Send failures', value: String(latestHealth.bounce_count ?? 0) },
                    { label: 'Unsubscribes', value: String(latestHealth.unsubscribe_count ?? 0) },
                    {
                      label: 'Open rate',
                      value: latestHealth.open_rate != null ? `${latestHealth.open_rate}%` : '—',
                    },
                    {
                      label: 'Click rate',
                      value: latestHealth.click_rate != null ? `${latestHealth.click_rate}%` : '—',
                    },
                  ].map(({ label, value }) => (
                    <div key={label} className="p-3 rounded-md bg-muted/30">
                      <p className="text-xs text-muted-foreground">{label}</p>
                      <p className="text-sm font-semibold text-foreground mt-0.5">{value}</p>
                    </div>
                  ))}
                </div>

                {/* Sparkline */}
                {sparklineData.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-xs text-muted-foreground">30-day trend</p>
                    <HealthSparkline data={sparklineData} />
                  </div>
                )}

                {/* Recommendations */}
                {recommendations.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-foreground">Recommendations</p>
                    <ul className="space-y-2">
                      {recommendations.map((rec, i) => (
                        <li key={i} className="text-xs text-muted-foreground pl-3 border-l-2 border-amber-400">
                          {rec.message}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right column: notes + industry */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Internal notes</CardTitle>
              <CardDescription>Admin only — never visible to the client.</CardDescription>
            </CardHeader>
            <CardContent>
              <ClientNotesEditor clientId={clientId} initialNotes={client.notes} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Industry</CardTitle>
              <CardDescription>
                Used in the Intelligence dashboard for cross-campaign breakdowns.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ClientIndustrySelect
                clientId={clientId}
                initialValue={(client as { client_industry?: string | null }).client_industry ?? null}
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
