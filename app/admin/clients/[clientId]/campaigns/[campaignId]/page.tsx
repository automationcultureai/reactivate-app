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
import { CampaignAnalytics } from '@/components/admin/CampaignAnalytics'
import { AddLeadsButton } from '@/components/admin/AddLeadsButton'
import { CampaignEditButton } from '@/components/admin/CampaignEditButton'
import { CampaignClickReport } from '@/components/admin/CampaignClickReport'
import { CampaignSequenceInfo } from '@/components/admin/CampaignSequenceInfo'
import { Separator } from '@/components/ui/separator'
import { ChevronLeft, Zap, AlertTriangle } from 'lucide-react'
import type { Booking, Lead, LeadEvent, Email, SmsMessage } from '@/lib/supabase'

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
    .select('name, email, business_name, business_address')
    .eq('id', clientId)
    .single()

  const clientData = client as { name: string; email: string; business_name: string | null; business_address: string | null } | null

  const { count: leadCount } = await supabase
    .from('leads')
    .select('*', { count: 'exact', head: true })
    .eq('campaign_id', campaignId)

  const leads = leadCount ?? 0

  // Fetch unresolved failed sends
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

  // Fetch lead IDs for joins
  const { data: leadIdRows } = await supabase
    .from('leads')
    .select('id')
    .eq('campaign_id', campaignId)

  const allLeadIds = (leadIdRows ?? []).map((l) => l.id)

  // Bookings
  const rawBookings = allLeadIds.length > 0
    ? (await supabase.from('bookings').select('*, leads(name)').in('lead_id', allLeadIds).order('scheduled_at', { ascending: false })).data ?? []
    : []

  const bookings = rawBookings.map((b) => ({
    ...(b as unknown as Booking),
    leadName: (b.leads as unknown as { name: string } | null)?.name ?? 'Unknown',
  }))

  // Leads with events + emails
  const { data: allLeads } = await supabase
    .from('leads')
    .select('*')
    .eq('campaign_id', campaignId)
    .order('created_at', { ascending: true })

  let leadsWithEvents: LeadWithEvents[] = []

  if (allLeads && allLeads.length > 0) {
    const ids = allLeads.map((l) => l.id)

    const [{ data: events }, { data: allEmails }, { data: allSms }] = await Promise.all([
      supabase.from('lead_events').select('*').in('lead_id', ids).order('created_at', { ascending: false }),
      supabase.from('emails').select('*').in('lead_id', ids).order('sequence_number', { ascending: true }),
      supabase.from('sms_messages').select('*').in('lead_id', ids).order('sequence_number', { ascending: true }),
    ])

    const eventsByLead = new Map<string, LeadEvent[]>()
    for (const e of events ?? []) {
      if (!eventsByLead.has(e.lead_id)) eventsByLead.set(e.lead_id, [])
      eventsByLead.get(e.lead_id)!.push(e as LeadEvent)
    }

    const emailsByLead = new Map<string, Email[]>()
    for (const e of allEmails ?? []) {
      if (!emailsByLead.has(e.lead_id)) emailsByLead.set(e.lead_id, [])
      emailsByLead.get(e.lead_id)!.push(e as Email)
    }

    const smsByLead = new Map<string, SmsMessage[]>()
    for (const s of allSms ?? []) {
      if (!smsByLead.has(s.lead_id)) smsByLead.set(s.lead_id, [])
      smsByLead.get(s.lead_id)!.push(s as SmsMessage)
    }

    leadsWithEvents = (allLeads as Lead[]).map((l) => ({
      ...l,
      events: eventsByLead.get(l.id) ?? [],
      emails: emailsByLead.get(l.id) ?? [],
      smses: smsByLead.get(l.id) ?? [],
    }))
  }

  // Analytics
  const emailedStatuses = ['emailed', 'sms_sent', 'clicked', 'booked', 'completed']
  const emailedLeads = (allLeads ?? []).filter((l) => emailedStatuses.includes(l.status)).length
  const clickedLeads = (allLeads ?? []).filter((l) => ['clicked', 'booked', 'completed'].includes(l.status)).length
  const bookedLeads = (allLeads ?? []).filter((l) => ['booked', 'completed'].includes(l.status)).length
  const completedLeads = (allLeads ?? []).filter((l) => l.status === 'completed').length

  // Count distinct leads that opened at least one email (same unit as emailedLeads denominator)
  let emailsOpenedCount = 0
  if (allLeadIds.length > 0) {
    const { data: openedRows } = await supabase.from('emails').select('lead_id').in('lead_id', allLeadIds).not('opened_at', 'is', null)
    emailsOpenedCount = new Set((openedRows ?? []).map((r) => r.lead_id)).size
  }

  const canAddLeads = !['complete'].includes(campaign.status)

  // Latest health score for this campaign
  const { data: healthRows } = await supabase
    .from('list_health_scores')
    .select('score, tier, recommendations, calculated_at')
    .eq('campaign_id', campaignId)
    .order('calculated_at', { ascending: false })
    .limit(1)

  const campaignHealth = healthRows?.[0] ?? null

  // Count pending leads (newly added, no sequences yet) — shows Generate button on active campaigns
  const pendingLeadCount = (allLeads ?? []).filter((l) => l.status === 'pending').length

  return (
    <div className="space-y-8">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2">
        <Link href={`/admin/clients/${clientId}`} className={cn(buttonVariants({ variant: 'ghost', size: 'icon' }))}>
          <ChevronLeft className="w-4 h-4" />
        </Link>
        <span className="text-sm text-muted-foreground">{clientData?.name}</span>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold text-foreground">{campaign.name}</h1>
            <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize', STATUS_STYLES[campaign.status] ?? 'bg-muted text-muted-foreground')}>
              {campaign.status}
            </span>
          </div>
          <p className="text-sm text-muted-foreground capitalize">
            {campaign.channel === 'both' ? 'Email + SMS' : campaign.channel} · {campaign.tone_preset} tone · {leads} leads
            {failures.length > 0 && <span className="text-destructive ml-2">· {failures.length} failed</span>}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {campaign.status !== 'complete' && (
            <CampaignEditButton campaign={campaign} clientId={clientId} />
          )}
          {canAddLeads && (
            <AddLeadsButton
              campaignId={campaignId}
              channel={campaign.channel as 'email' | 'sms' | 'both'}
            />
          )}
          {/* Generate — shown for draft, or for active/paused/ready when there are pending (new) leads */}
          {(campaign.status === 'draft' || (pendingLeadCount > 0 && campaign.status !== 'complete')) && (
            <GenerateButton
              campaignId={campaignId}
              clientId={clientId}
              leadCount={campaign.status === 'draft' ? leads : pendingLeadCount}
              label={campaign.status === 'draft' ? 'Generate sequences' : `Generate for ${pendingLeadCount} new lead${pendingLeadCount !== 1 ? 's' : ''}`}
            />
          )}
          {campaign.status === 'ready' && (
            <Link href={`/admin/clients/${clientId}/campaigns/${campaignId}/preview`} className={cn(buttonVariants())}>
              Preview &amp; send
            </Link>
          )}
          {(campaign.status === 'active' || campaign.status === 'paused') && (
            <PauseResumeButton campaignId={campaignId} currentStatus={campaign.status as 'active' | 'paused'} />
          )}
        </div>
      </div>

      {/* Status info */}
      {campaign.status === 'draft' && (
        <div className="rounded-lg border border-border p-6 text-center space-y-3">
          <Zap className="w-8 h-8 text-muted-foreground/40 mx-auto" />
          <p className="text-sm font-medium text-foreground">Ready to generate</p>
          <p className="text-xs text-muted-foreground max-w-sm mx-auto">
            Click <strong>Generate sequences</strong> above to have Claude create personalised email and SMS sequences for all {leads} leads.
          </p>
        </div>
      )}

      {campaign.status === 'ready' && (
        <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-6 text-center space-y-3">
          <p className="text-sm font-medium text-foreground">Sequences ready</p>
          <p className="text-xs text-muted-foreground max-w-sm mx-auto">
            Click <strong>Preview &amp; send</strong> to review and edit emails before approving.
          </p>
        </div>
      )}

      <CampaignSequenceInfo channel={campaign.channel} />

      {/* Health score warning banner — shown when score < 60 */}
      {campaignHealth && campaignHealth.score < 60 && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-4 flex items-start gap-3">
          <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
          <div className="space-y-1 min-w-0">
            <p className="text-sm font-medium text-red-600 dark:text-red-400">
              List health at risk — score {campaignHealth.score}/100
            </p>
            {(campaignHealth.recommendations as Array<{ message: string }> | null)?.[0] && (
              <p className="text-xs text-muted-foreground">
                {(campaignHealth.recommendations as Array<{ message: string }>)[0].message}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Metadata — compact single line */}
      <div className="flex items-center gap-x-6 gap-y-1 flex-wrap text-sm border-t border-border pt-4">
        {[
          { label: 'Channel',       value: campaign.channel === 'both' ? 'Email + SMS' : campaign.channel.toUpperCase() },
          { label: 'Tone',          value: campaign.tone_preset },
          { label: 'Consent',       value: campaign.consent_basis },
          { label: 'Leads',         value: String(leads) },
          ...(campaign.activated_at ? [{
            label: 'Activated',
            value: new Date(campaign.activated_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }),
          }] : []),
        ].map(({ label, value }) => (
          <span key={label} className="whitespace-nowrap">
            <span className="text-muted-foreground">{label} </span>
            <span className="font-medium text-foreground capitalize">{value}</span>
          </span>
        ))}
        {campaignHealth && (
          <span className="whitespace-nowrap">
            <span className="text-muted-foreground">List health </span>
            <span className={cn(
              'font-semibold font-mono',
              campaignHealth.tier === 'healthy' ? 'text-green-600 dark:text-green-400' :
              campaignHealth.tier === 'moderate' ? 'text-amber-600 dark:text-amber-400' :
              'text-red-600 dark:text-red-400'
            )}>
              {campaignHealth.score}/100
            </span>
            <span className="text-muted-foreground capitalize"> · {(campaignHealth.tier as string).replace('_', ' ')}</span>
          </span>
        )}
      </div>

      {/* Analytics */}
      {emailedLeads > 0 && (
        <>
          <Separator />
          <div className="space-y-3">
            <h3 className="text-base font-semibold text-foreground">Performance</h3>
            <CampaignAnalytics emailsSent={emailedLeads} emailsOpened={emailsOpenedCount} leadCount={leads} clickedCount={clickedLeads} bookedCount={bookedLeads} completedCount={completedLeads} />
          </div>
        </>
      )}

      {/* Bookings */}
      {bookings.length > 0 && (
        <>
          <Separator />
          <div className="space-y-3">
            <h3 className="text-base font-semibold text-foreground">Bookings ({bookings.length})</h3>
            <CampaignBookings bookings={bookings} />
          </div>
        </>
      )}

      {/* Click report */}
      <>
        <Separator />
        <div className="space-y-3">
          <div>
            <h3 className="text-base font-semibold text-foreground">
              Click tracking report
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Leads who clicked your campaign link.
              Use this for reconciliation with the studio owner.
            </p>
          </div>
          <CampaignClickReport
            campaignId={campaignId}
            externalBookingUrl={campaign.external_booking_url ?? null}
          />
        </div>
      </>

      {/* Leads list */}
      {leadsWithEvents.length > 0 && (
        <>
          <Separator />
          <div className="space-y-3">
            <div>
              <h3 className="text-base font-semibold text-foreground">Leads ({leadsWithEvents.length})</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Click a row to expand emails and audit log. Use action buttons to edit, opt out, send next email, or erase data.
              </p>
            </div>
            <CampaignLeadList
              leads={leadsWithEvents}
              campaignId={campaignId}
              campaignStatus={campaign.status}
              channel={campaign.channel}
              clientEmail={clientData?.email}
              clientBusinessName={clientData?.business_name ?? clientData?.name}
              clientBusinessAddress={clientData?.business_address ?? undefined}
            />
          </div>
        </>
      )}

      {/* Failed sends */}
      {failures.length > 0 && (
        <>
          <Separator />
          <FailedSendsList failures={failures} />
        </>
      )}
    </div>
  )
}
