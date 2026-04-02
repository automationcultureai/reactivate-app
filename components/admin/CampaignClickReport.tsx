import { getSupabaseClient } from '@/lib/supabase'
import { ClickReportExportButton } from '@/components/admin/ClickReportExportButton'

interface CampaignClickReportProps {
  campaignId: string
  externalBookingUrl: string | null
}

const STATUS_BADGE: Record<string, string> = {
  clicked: 'bg-blue-500/10 text-blue-600',
  booked: 'bg-green-500/10 text-green-600',
  completed: 'bg-muted text-muted-foreground',
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  const date = d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
  const time = d.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit', hour12: true })
  return `${date}, ${time}`
}

export async function CampaignClickReport({ campaignId, externalBookingUrl }: CampaignClickReportProps) {
  const supabase = getSupabaseClient()

  // Fetch campaign
  const { data: campaign } = await supabase
    .from('campaigns')
    .select('id, name, client_id, created_at, external_booking_url')
    .eq('id', campaignId)
    .single()

  if (!campaign) return null

  // Fetch all non-deleted leads
  const { data: leads } = await supabase
    .from('leads')
    .select('id, name, email, phone, status')
    .eq('campaign_id', campaignId)
    .neq('status', 'deleted')

  const allLeads = leads ?? []
  const leadIds = allLeads.map((l) => l.id)

  // Fetch earliest clicked lead_event per lead
  const { data: clickEvents } = leadIds.length > 0
    ? await supabase
        .from('lead_events')
        .select('lead_id, created_at')
        .eq('event_type', 'clicked')
        .in('lead_id', leadIds)
    : { data: [] }

  const earliestEventByLead = new Map<string, string>()
  for (const ev of (clickEvents ?? [])) {
    const existing = earliestEventByLead.get(ev.lead_id)
    if (!existing || ev.created_at < existing) {
      earliestEventByLead.set(ev.lead_id, ev.created_at)
    }
  }

  // Fetch earliest email clicked_at per lead
  const { data: emailClicks } = leadIds.length > 0
    ? await supabase
        .from('emails')
        .select('lead_id, clicked_at')
        .in('lead_id', leadIds)
        .not('clicked_at', 'is', null)
    : { data: [] }

  const earliestEmailClickByLead = new Map<string, string>()
  for (const ec of (emailClicks ?? [])) {
    if (!ec.clicked_at) continue
    const existing = earliestEmailClickByLead.get(ec.lead_id)
    if (!existing || ec.clicked_at < existing) {
      earliestEmailClickByLead.set(ec.lead_id, ec.clicked_at)
    }
  }

  const clickedStatuses = new Set(['clicked', 'booked', 'completed'])

  const clickedLeads = allLeads
    .filter((l) => clickedStatuses.has(l.status))
    .map((l) => {
      const emailClickedAt = earliestEmailClickByLead.get(l.id) ?? null
      const eventClickedAt = earliestEventByLead.get(l.id) ?? null
      const clicked_at = emailClickedAt ?? eventClickedAt ?? null
      return {
        name: l.name,
        email: (l.email as string | null) ?? null,
        phone: (l.phone as string | null) ?? null,
        status: l.status,
        clicked_at,
      }
    })
    .sort((a, b) => {
      if (a.clicked_at === null && b.clicked_at === null) return 0
      if (a.clicked_at === null) return 1
      if (b.clicked_at === null) return -1
      return a.clicked_at < b.clicked_at ? -1 : 1
    })

  const totalLeads = allLeads.length
  const totalClicked = clickedLeads.length
  const conversionRate = totalLeads > 0
    ? `${((totalClicked / totalLeads) * 100).toFixed(1)}%`
    : '0%'

  if (totalClicked === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No leads have clicked through yet.
      </p>
    )
  }

  return (
    <div className="space-y-4">
      {/* Summary row */}
      <div className="flex gap-3 flex-wrap">
        {[
          { label: 'Total leads', value: String(totalLeads) },
          { label: 'Clicked through', value: String(totalClicked) },
          { label: 'Conversion rate', value: conversionRate },
        ].map(({ label, value }) => (
          <div key={label} className="rounded-lg border border-border bg-muted/30 px-4 py-3 space-y-0.5">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="text-lg font-semibold text-foreground">{value}</p>
          </div>
        ))}
      </div>

      {/* Booking destination */}
      <p className="text-xs text-muted-foreground">
        Booking destination:{' '}
        {externalBookingUrl ? (
          <a
            href={externalBookingUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-foreground underline underline-offset-2 hover:text-muted-foreground transition-colors"
          >
            {externalBookingUrl}
          </a>
        ) : (
          <span className="text-foreground">Built-in booking page</span>
        )}
      </p>

      {/* Clicked leads table */}
      <div className="rounded-lg border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              {['Name', 'Email', 'Phone', 'Status', 'Clicked at'].map((col) => (
                <th key={col} className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {clickedLeads.map((lead, i) => (
              <tr
                key={`${lead.name}-${i}`}
                className={`border-b border-border last:border-0 ${i % 2 === 0 ? 'bg-muted/10' : ''}`}
              >
                <td className="px-4 py-2.5 text-xs text-foreground">{lead.name}</td>
                <td className="px-4 py-2.5 text-xs text-foreground">
                  {lead.email ?? <span className="text-muted-foreground">—</span>}
                </td>
                <td className="px-4 py-2.5 text-xs text-foreground">
                  {lead.phone ?? <span className="text-muted-foreground">—</span>}
                </td>
                <td className="px-4 py-2.5 text-xs text-foreground">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize ${STATUS_BADGE[lead.status] ?? 'bg-muted text-muted-foreground'}`}>
                    {lead.status}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-xs text-foreground">
                  {lead.clicked_at
                    ? formatDate(lead.clicked_at)
                    : <span className="text-muted-foreground">—</span>
                  }
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Export button */}
      <ClickReportExportButton leads={clickedLeads} campaignName={campaign.name} />
    </div>
  )
}
