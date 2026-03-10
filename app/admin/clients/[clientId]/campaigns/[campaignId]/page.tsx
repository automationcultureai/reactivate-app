import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getSupabaseClient } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import { buttonVariants } from '@/lib/button-variants'
import { GenerateButton } from '@/components/admin/GenerateButton'
import { FailedSendsList } from '@/components/admin/FailedSendsList'
import { CampaignBookings } from '@/components/admin/CampaignBookings'
import { PauseResumeButton } from '@/components/admin/PauseResumeButton'
import { CampaignLeadList, LeadWithEvents } from '@/components/admin/CampaignLeadList'
import { Separator } from '@/components/ui/separator'
import { ChevronLeft, Zap } from 'lucide-react'
import type { Booking, Lead, LeadEvent } from '@/lib/supabase'

const STATUS_STYLES: Record<string, string> = {
  draft: 'bg-muted text-muted-foreground',
  ready: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  active: 'bg-green-500/10 text-green-600 dark:text-green-400',
  paused: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  complete: 'bg-muted text-muted-foreground',
}

interface Props {
  params: Promise<{ clientId: string; campaignId: string }>
}

export default async function CampaignDetailPage({ params }: Props) {
  const { clientId, campaignId } = await params
  const supabase = getSupabaseClient()

  const { data: campaign, error } = await supabase
    .from('campaigns')
    .select('*')
    .eq('id', campaignId)
    .eq('client_id', clientId)
    .single()

  if (error || !campaign) notFound()

  const { data: client } = await supabase
    .from('clients')
    .select('name')
    .eq('id', clientId)
    .single()

  const { count: leadCount } = await supabase
    .from('leads')
    .select('*', { count: 'exact', head: true })
    .eq('campaign_id', campaignId)

  const leads = leadCount ?? 0

  // Fetch unresolved failed sends with lead names
  const { data: rawFailures } = await supabase
    .from('send_failures')
    .select('*, leads(name)')
    .eq('campaign_id', campaignId)
    .eq('resolved', false)
    .order('created_at', { ascending: false })

  const failures = (rawFailures ?? []).map((f) => ({
    ...f,
    leadName: (f.leads as { name: string } | null)?.name ?? 'Unknown lead',
  }))

  // Fetch bookings for leads in this campaign (for admin override section)
  const { data: leadIds } = await supabase
    .from('leads')
    .select('id')
    .eq('campaign_id', campaignId)

  const allLeadIds = (leadIds ?? []).map((l) => l.id)
  const rawBookings = allLeadIds.length > 0
    ? (await supabase
        .from('bookings')
        .select('*, leads(name)')
        .in('lead_id', allLeadIds)
        .order('scheduled_at', { ascending: false })
      ).data ?? []
    : []

  const bookings = rawBookings.map((b) => ({
    ...(b as unknown as Booking),
    leadName: (b.leads as unknown as { name: string } | null)?.name ?? 'Unknown',
  }))

  // Fetch all leads with their event logs (for audit log + GDPR erasure section)
  const { data: allLeads } = await supabase
    .from('leads')
    .select('*')
    .eq('campaign_id', campaignId)
    .order('created_at', { ascending: true })

  let leadsWithEvents: LeadWithEvents[] = []
  if (allLeads && allLeads.length > 0) {
    const ids = allLeads.map((l) => l.id)
    const { data: events } = await supabase
      .from('lead_events')
      .select('*')
      .in('lead_id', ids)
      .order('created_at', { ascending: false })

    const eventsByLead = new Map<string, LeadEvent[]>()
    for (const e of events ?? []) {
      if (!eventsByLead.has(e.lead_id)) eventsByLead.set(e.lead_id, [])
      eventsByLead.get(e.lead_id)!.push(e as LeadEvent)
    }

    leadsWithEvents = (allLeads as Lead[]).map((l) => ({
      ...l,
      events: eventsByLead.get(l.id) ?? [],
    }))
  }

  return (
    <div className="space-y-8">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2">
        <Link
          href={`/admin/clients/${clientId}`}
          className={cn(buttonVariants({ variant: 'ghost', size: 'icon' }))}
        >
          <ChevronLeft className="w-4 h-4" />
        </Link>
        <span className="text-sm text-muted-foreground">{client?.name}</span>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold text-foreground">{campaign.name}</h1>
            <span
              className={cn(
                'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize',
                STATUS_STYLES[campaign.status] ?? 'bg-muted text-muted-foreground'
              )}
            >
              {campaign.status}
            </span>
          </div>
          <p className="text-sm text-muted-foreground capitalize">
            {campaign.channel} · {campaign.tone_preset} tone · {leads} leads
            {failures.length > 0 && (
              <span className="text-destructive ml-2">· {failures.length} failed</span>
            )}
          </p>
        </div>

        {/* Action button varies by status */}
        {campaign.status === 'draft' && (
          <GenerateButton campaignId={campaignId} clientId={clientId} leadCount={leads} />
        )}

        {campaign.status === 'ready' && (
          <Link
            href={`/admin/clients/${clientId}/campaigns/${campaignId}/preview`}
            className={cn(buttonVariants())}
          >
            Preview &amp; send
          </Link>
        )}

        {/* Pause / Resume — shown for active and paused campaigns */}
        {(campaign.status === 'active' || campaign.status === 'paused') && (
          <PauseResumeButton
            campaignId={campaignId}
            currentStatus={campaign.status as 'active' | 'paused'}
          />
        )}
      </div>

      {/* Status-based info panel */}
      {campaign.status === 'draft' && (
        <div className="rounded-lg border border-border p-6 text-center space-y-3">
          <Zap className="w-8 h-8 text-muted-foreground/40 mx-auto" />
          <p className="text-sm font-medium text-foreground">Ready to generate</p>
          <p className="text-xs text-muted-foreground max-w-sm mx-auto">
            Click <strong>Generate sequences</strong> above to have Claude create personalised email
            and SMS sequences for all {leads} leads. You&apos;ll review and edit everything before
            anything is sent.
          </p>
        </div>
      )}

      {campaign.status === 'ready' && (
        <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-6 text-center space-y-3">
          <p className="text-sm font-medium text-foreground">Sequences ready</p>
          <p className="text-xs text-muted-foreground max-w-sm mx-auto">
            All sequences have been generated. Click <strong>Preview &amp; send</strong> to review
            and edit emails before approving the campaign.
          </p>
        </div>
      )}

      {/* Campaign metadata grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Channel', value: campaign.channel.toUpperCase() },
          { label: 'Tone', value: campaign.tone_preset },
          { label: 'Consent basis', value: campaign.consent_basis },
          { label: 'Leads', value: String(leads) },
        ].map(({ label, value }) => (
          <div key={label} className="p-4 rounded-lg border border-border">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="text-sm font-medium text-foreground mt-1 capitalize">{value}</p>
          </div>
        ))}
      </div>

      {/* Bookings section — with admin override complete button */}
      {bookings.length > 0 && (
        <>
          <Separator />
          <div className="space-y-3">
            <h3 className="text-base font-semibold text-foreground">
              Bookings ({bookings.length})
            </h3>
            <CampaignBookings bookings={bookings} />
          </div>
        </>
      )}

      {/* Leads with event log + GDPR erasure */}
      {leadsWithEvents.length > 0 && (
        <>
          <Separator />
          <div className="space-y-3">
            <div>
              <h3 className="text-base font-semibold text-foreground">
                Leads ({leadsWithEvents.length})
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Click any row to expand the full audit log. Use the trash icon to erase personal data (GDPR right to erasure).
              </p>
            </div>
            <CampaignLeadList leads={leadsWithEvents} />
          </div>
        </>
      )}

      {/* Failed sends section — only shown when failures exist */}
      {failures.length > 0 && (
        <>
          <Separator />
          <FailedSendsList failures={failures} />
        </>
      )}
    </div>
  )
}
