import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getSupabaseClient } from '@/lib/supabase'
import { getAdminUserId } from '@/lib/auth'
import { cn } from '@/lib/utils'
import { buttonVariants } from '@/lib/button-variants'
import { IntelligenceTabs } from '@/components/admin/IntelligenceTabs'
import type {
  IntelligenceData,
  ToneRow,
  ChannelRow,
  IndustryRow,
  SequenceRow,
  HeatmapCell,
  TopSubjectRow,
  TopBodyRow,
} from '@/components/admin/IntelligenceTabs'

interface Props {
  searchParams: Promise<{ range?: string }>
}

const RANGE_OPTIONS = [
  { label: 'Last 30 days', value: '30' },
  { label: 'Last 90 days', value: '90' },
  { label: 'Last 12 months', value: '365' },
  { label: 'All time', value: 'all' },
]

function getDateFilter(range: string): string | null {
  if (range === 'all') return null
  const days = parseInt(range, 10)
  if (isNaN(days)) return null
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d.toISOString()
}

export default async function IntelligencePage({ searchParams }: Props) {
  // Server-side admin check — not relying on UI hiding alone
  const adminId = await getAdminUserId()
  if (!adminId) redirect('/sign-in')

  const { range = '90' } = await searchParams
  const supabase = getSupabaseClient()
  const dateFilter = getDateFilter(range)

  // ----------------------------------------------------------------
  // Fetch raw data
  // ----------------------------------------------------------------

  let campaignQuery = supabase
    .from('campaigns')
    .select('id, client_id, tone_preset, channel, created_at')

  if (dateFilter) {
    campaignQuery = campaignQuery.gte('created_at', dateFilter)
  }

  const { data: campaigns } = await campaignQuery
  const campaignIds = (campaigns ?? []).map((c) => c.id)

  // Clients (for industry mapping)
  const { data: clients } = await supabase
    .from('clients')
    .select('id, client_industry')

  const industryByClient = new Map<string, string | null>()
  for (const c of clients ?? []) {
    industryByClient.set(c.id, c.client_industry)
  }

  if (campaignIds.length === 0) {
    return renderPage(range, emptyData(range))
  }

  // Leads
  const { data: leads } = await supabase
    .from('leads')
    .select('id, campaign_id, client_id, status, created_at')
    .in('campaign_id', campaignIds)

  const leadIds = (leads ?? []).map((l) => l.id)

  // Emails (sent only)
  const emailsData =
    leadIds.length > 0
      ? (
          await supabase
            .from('emails')
            .select('id, lead_id, sequence_number, subject, body, sent_at, opened_at, clicked_at')
            .in('lead_id', leadIds)
            .not('sent_at', 'is', null)
        ).data ?? []
      : []

  // Bookings
  const bookingsData =
    leadIds.length > 0
      ? (
          await supabase
            .from('bookings')
            .select('id, lead_id, client_id, status, created_at')
            .in('lead_id', leadIds)
        ).data ?? []
      : []

  // ----------------------------------------------------------------
  // Headline stats
  // ----------------------------------------------------------------

  const totalLeadsContacted = (leads ?? []).filter((l) =>
    ['emailed', 'sms_sent', 'clicked', 'booked', 'completed', 'unsubscribed', 'cancelled'].includes(l.status)
  ).length

  const totalBooked = bookingsData.filter((b) => b.status !== 'cancelled').length
  const totalCompleted = bookingsData.filter((b) => b.status === 'completed').length

  const overallBookingRate =
    totalLeadsContacted > 0 ? Math.round((totalBooked / totalLeadsContacted) * 100) : 0
  const overallCompletionRate =
    totalLeadsContacted > 0 ? Math.round((totalCompleted / totalLeadsContacted) * 100) : 0

  // ----------------------------------------------------------------
  // Helper: aggregate by campaign group
  // ----------------------------------------------------------------

  function aggregateCampaignGroup(
    groupCampaignIds: string[]
  ): { sent: number; opened: number; clicked: number; leads: number; booked: number; completed: number } {
    const groupLeads = (leads ?? []).filter((l) => groupCampaignIds.includes(l.campaign_id))
    const groupLeadIds = new Set(groupLeads.map((l) => l.id))
    const groupEmails = emailsData.filter((e) => groupLeadIds.has(e.lead_id))
    const groupBookings = bookingsData.filter((b) => groupLeadIds.has(b.lead_id))

    return {
      sent: groupEmails.length,
      opened: groupEmails.filter((e) => e.opened_at).length,
      clicked: groupEmails.filter((e) => e.clicked_at).length,
      leads: groupLeads.length,
      booked: groupBookings.filter((b) => b.status !== 'cancelled').length,
      completed: groupBookings.filter((b) => b.status === 'completed').length,
    }
  }

  // ----------------------------------------------------------------
  // By Tone
  // ----------------------------------------------------------------

  const toneGroups = new Map<string, string[]>()
  for (const c of campaigns ?? []) {
    if (!toneGroups.has(c.tone_preset)) toneGroups.set(c.tone_preset, [])
    toneGroups.get(c.tone_preset)!.push(c.id)
  }

  const byTone: ToneRow[] = []
  for (const [tone, ids] of toneGroups) {
    const agg = aggregateCampaignGroup(ids)
    byTone.push({
      tone,
      campaigns: ids.length,
      avgOpenRate: agg.sent > 0 ? Math.round((agg.opened / agg.sent) * 100) : 0,
      avgClickRate: agg.sent > 0 ? Math.round((agg.clicked / agg.sent) * 100) : 0,
      avgBookingRate: agg.leads > 0 ? Math.round((agg.booked / agg.leads) * 100) : 0,
      avgCompletionRate: agg.leads > 0 ? Math.round((agg.completed / agg.leads) * 100) : 0,
    })
  }
  byTone.sort((a, b) => b.avgOpenRate - a.avgOpenRate)

  // ----------------------------------------------------------------
  // By Channel
  // ----------------------------------------------------------------

  const channelGroups = new Map<string, string[]>()
  for (const c of campaigns ?? []) {
    if (!channelGroups.has(c.channel)) channelGroups.set(c.channel, [])
    channelGroups.get(c.channel)!.push(c.id)
  }

  const byChannel: ChannelRow[] = []
  for (const [channel, ids] of channelGroups) {
    const agg = aggregateCampaignGroup(ids)

    // Avg time from first email sent to booking creation (in hours)
    const groupLeads = (leads ?? []).filter((l) => ids.includes(l.campaign_id))
    const groupLeadIds = new Set(groupLeads.map((l) => l.id))
    const groupBookings = bookingsData.filter((b) => groupLeadIds.has(b.lead_id) && b.status !== 'cancelled')

    const firstEmailByLead = new Map<string, string>()
    for (const e of emailsData) {
      if (!groupLeadIds.has(e.lead_id)) continue
      if (!firstEmailByLead.has(e.lead_id)) {
        firstEmailByLead.set(e.lead_id, e.sent_at!)
      }
    }

    const timeDeltas: number[] = []
    for (const booking of groupBookings) {
      const firstSent = firstEmailByLead.get(booking.lead_id)
      if (firstSent) {
        const delta = (new Date(booking.created_at).getTime() - new Date(firstSent).getTime()) / (1000 * 60 * 60)
        if (delta >= 0) timeDeltas.push(delta)
      }
    }

    const avgTimeToBookingHours =
      timeDeltas.length > 0
        ? Math.round(timeDeltas.reduce((s, v) => s + v, 0) / timeDeltas.length)
        : 0

    byChannel.push({
      channel,
      campaigns: ids.length,
      avgOpenRate: agg.sent > 0 ? Math.round((agg.opened / agg.sent) * 100) : 0,
      avgBookingRate: agg.leads > 0 ? Math.round((agg.booked / agg.leads) * 100) : 0,
      avgCompletionRate: agg.leads > 0 ? Math.round((agg.completed / agg.leads) * 100) : 0,
      avgTimeToBookingHours,
    })
  }

  // ----------------------------------------------------------------
  // By Industry
  // ----------------------------------------------------------------

  const industryGroups = new Map<string, string[]>()
  for (const c of campaigns ?? []) {
    const industry = industryByClient.get(c.client_id)
    if (!industry) continue
    if (!industryGroups.has(industry)) industryGroups.set(industry, [])
    industryGroups.get(industry)!.push(c.id)
  }

  const byIndustry: IndustryRow[] = []
  for (const [industry, ids] of industryGroups) {
    const agg = aggregateCampaignGroup(ids)
    byIndustry.push({
      industry,
      campaigns: ids.length,
      avgOpenRate: agg.sent > 0 ? Math.round((agg.opened / agg.sent) * 100) : 0,
      avgClickRate: agg.sent > 0 ? Math.round((agg.clicked / agg.sent) * 100) : 0,
      avgBookingRate: agg.leads > 0 ? Math.round((agg.booked / agg.leads) * 100) : 0,
      avgCompletionRate: agg.leads > 0 ? Math.round((agg.completed / agg.leads) * 100) : 0,
    })
  }
  byIndustry.sort((a, b) => b.avgOpenRate - a.avgOpenRate)

  // ----------------------------------------------------------------
  // By Sequence Position
  // ----------------------------------------------------------------

  const seqMap = new Map<number, { sent: number; opened: number; clicked: number }>()
  for (const e of emailsData) {
    const pos = e.sequence_number as number
    if (!seqMap.has(pos)) seqMap.set(pos, { sent: 0, opened: 0, clicked: 0 })
    const entry = seqMap.get(pos)!
    entry.sent++
    if (e.opened_at) entry.opened++
    if (e.clicked_at) entry.clicked++
  }

  // Bookings attributed to email click (using lead status transitions as proxy)
  const bookedLeadIds = new Set(bookingsData.filter((b) => b.status !== 'cancelled').map((b) => b.lead_id))

  const bySequence: SequenceRow[] = [1, 2, 3, 4].map((pos) => {
    const entry = seqMap.get(pos) ?? { sent: 0, opened: 0, clicked: 0 }
    // Leads who received this email and eventually booked
    const emailLeadIds = new Set(emailsData.filter((e) => e.sequence_number === pos).map((e) => e.lead_id))
    const bookingsFromStep = [...emailLeadIds].filter((id) => bookedLeadIds.has(id)).length

    return {
      position: pos,
      emailsSent: entry.sent,
      opens: entry.opened,
      clicks: entry.clicked,
      openRate: entry.sent > 0 ? Math.round((entry.opened / entry.sent) * 100) : 0,
      clickRate: entry.sent > 0 ? Math.round((entry.clicked / entry.sent) * 100) : 0,
      bookingsFromStep,
    }
  })

  // ----------------------------------------------------------------
  // Send time heatmap (day × hour open rates)
  // ----------------------------------------------------------------

  const heatmap: HeatmapCell[][] = Array.from({ length: 7 }, (_, day) =>
    Array.from({ length: 24 }, (_, hour) => ({ dayOfWeek: day, hour, sends: 0, opens: 0, openRate: 0 }))
  )

  for (const e of emailsData) {
    if (!e.sent_at) continue
    const d = new Date(e.sent_at)
    const day = d.getUTCDay()
    const hour = d.getUTCHours()
    heatmap[day][hour].sends++
    if (e.opened_at) heatmap[day][hour].opens++
  }

  for (const dayRow of heatmap) {
    for (const cell of dayRow) {
      cell.openRate = cell.sends > 0 ? Math.round((cell.opens / cell.sends) * 100) : 0
    }
  }

  // ----------------------------------------------------------------
  // Top subject lines (by open rate, min 3 sends)
  // ----------------------------------------------------------------

  const subjectMap = new Map<string, { sends: number; opens: number; campaignIds: Set<string> }>()
  for (const e of emailsData) {
    if (!e.subject) continue
    const leadCampaign = (leads ?? []).find((l) => l.id === e.lead_id)?.campaign_id
    if (!subjectMap.has(e.subject)) subjectMap.set(e.subject, { sends: 0, opens: 0, campaignIds: new Set() })
    const entry = subjectMap.get(e.subject)!
    entry.sends++
    if (e.opened_at) entry.opens++
    if (leadCampaign) entry.campaignIds.add(leadCampaign)
  }

  const topSubjects: TopSubjectRow[] = [...subjectMap.entries()]
    .filter(([, v]) => v.sends >= 3)
    .map(([subject, v]) => ({
      subject,
      openRate: Math.round((v.opens / v.sends) * 100),
      sends: v.sends,
      campaigns: v.campaignIds.size,
    }))
    .sort((a, b) => b.openRate - a.openRate)
    .slice(0, 20)

  // ----------------------------------------------------------------
  // Top email bodies (by click rate, min 3 sends)
  // ----------------------------------------------------------------

  const bodyMap = new Map<string, { sends: number; clicks: number }>()
  for (const e of emailsData) {
    if (!e.body) continue
    const snippet = e.body.slice(0, 100)
    if (!bodyMap.has(snippet)) bodyMap.set(snippet, { sends: 0, clicks: 0 })
    const entry = bodyMap.get(snippet)!
    entry.sends++
    if (e.clicked_at) entry.clicks++
  }

  const topBodies: TopBodyRow[] = [...bodyMap.entries()]
    .filter(([, v]) => v.sends >= 3)
    .map(([bodySnippet, v]) => ({
      bodySnippet,
      clickRate: Math.round((v.clicks / v.sends) * 100),
      sends: v.sends,
    }))
    .sort((a, b) => b.clickRate - a.clickRate)
    .slice(0, 10)

  // ----------------------------------------------------------------
  // Assemble data object
  // ----------------------------------------------------------------

  const data: IntelligenceData = {
    range,
    headline: {
      totalCampaigns: (campaigns ?? []).length,
      totalLeadsContacted,
      overallBookingRate,
      overallCompletionRate,
    },
    byTone,
    byChannel,
    byIndustry,
    bySequence,
    sendTimeHeatmap: heatmap,
    topSubjects,
    topBodies,
  }

  return renderPage(range, data)
}

function emptyData(range: string): IntelligenceData {
  const heatmap: HeatmapCell[][] = Array.from({ length: 7 }, (_, day) =>
    Array.from({ length: 24 }, (_, hour) => ({ dayOfWeek: day, hour, sends: 0, opens: 0, openRate: 0 }))
  )
  return {
    range,
    headline: { totalCampaigns: 0, totalLeadsContacted: 0, overallBookingRate: 0, overallCompletionRate: 0 },
    byTone: [],
    byChannel: [],
    byIndustry: [],
    bySequence: [],
    sendTimeHeatmap: heatmap,
    topSubjects: [],
    topBodies: [],
  }
}

function renderPage(range: string, data: IntelligenceData) {
  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Intelligence</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Cross-campaign performance analytics · admin only
          </p>
        </div>
        {/* Date range filter */}
        <div className="flex gap-1">
          {RANGE_OPTIONS.map((opt) => (
            <Link
              key={opt.value}
              href={`/admin/intelligence?range=${opt.value}`}
              className={cn(
                'px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
                range === opt.value
                  ? 'bg-primary text-primary-foreground'
                  : cn(buttonVariants({ variant: 'outline', size: 'sm' }))
              )}
            >
              {opt.label}
            </Link>
          ))}
        </div>
      </div>

      <IntelligenceTabs data={data} />
    </div>
  )
}
