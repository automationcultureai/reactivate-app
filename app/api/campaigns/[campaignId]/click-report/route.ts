import { NextRequest, NextResponse } from 'next/server'
import { getAdminUserId } from '@/lib/auth'
import { getSupabaseClient } from '@/lib/supabase'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ campaignId: string }> }
) {
  try {
    const adminUserId = await getAdminUserId()
    if (!adminUserId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { campaignId } = await params
    const supabase = getSupabaseClient()

    // Fetch campaign
    const { data: campaign, error: campaignError } = await supabase
      .from('campaigns')
      .select('id, name, client_id, created_at, external_booking_url')
      .eq('id', campaignId)
      .single()

    if (campaignError || !campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
    }

    // Fetch client
    const { data: client } = await supabase
      .from('clients')
      .select('name, business_name')
      .eq('id', campaign.client_id)
      .single()

    // Fetch all non-deleted leads for this campaign
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
    const now = new Date().toISOString()

    const clickedLeads = allLeads
      .filter((l) => clickedStatuses.has(l.status))
      .map((l) => {
        const emailClickedAt = earliestEmailClickByLead.get(l.id) ?? null
        const eventClickedAt = earliestEventByLead.get(l.id) ?? null
        const clicked_at = emailClickedAt ?? eventClickedAt ?? null
        return {
          name: l.name,
          email: l.email ?? null,
          phone: l.phone ?? null,
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
    const conversionRate =
      totalLeads > 0
        ? `${((totalClicked / totalLeads) * 100).toFixed(1)}%`
        : '0.0%'

    return NextResponse.json({
      campaign_id: campaign.id,
      campaign_name: campaign.name,
      client_name: client?.business_name ?? client?.name ?? '',
      report_generated_at: now,
      report_period: {
        start: campaign.created_at,
        end: now,
      },
      total_leads: totalLeads,
      total_clicked: totalClicked,
      conversion_rate: conversionRate,
      external_booking_url: campaign.external_booking_url ?? null,
      clicked_leads: clickedLeads,
    })
  } catch (err) {
    console.error('[campaigns/click-report] Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
