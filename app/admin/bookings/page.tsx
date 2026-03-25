import { getSupabaseClient } from '@/lib/supabase'
import { AdminBookingsList, type ClientGroupData } from '@/components/admin/AdminBookingsList'

export default async function AdminBookingsPage() {
  const supabase = getSupabaseClient()

  const { data: rawBookings, error } = await supabase
    .from('bookings')
    .select(`
      id,
      scheduled_at,
      completed_at,
      completed_by,
      status,
      client_id,
      leads(name, campaign_id, campaigns(id, name)),
      clients(id, name, business_name)
    `)
    .order('scheduled_at', { ascending: false })

  if (error) {
    return <div className="text-destructive text-sm">Failed to load bookings.</div>
  }

  // Group: client → campaign → bookings (using plain objects for client component)
  type BookingRow = {
    id: string; scheduled_at: string; completed_at: string | null
    completed_by: string | null; status: string; leadName: string
  }
  type CampaignGroup = {
    campaignId: string; campaignName: string; bookings: BookingRow[]
    counts: { upcoming: number; completed: number; cancelled: number }
  }
  type ClientGroup = {
    clientId: string; clientName: string
    campaigns: Map<string, CampaignGroup>
  }

  const clientMap = new Map<string, ClientGroup>()

  for (const b of rawBookings ?? []) {
    const client = b.clients as unknown as { id: string; name: string; business_name: string | null } | null
    const lead   = b.leads   as unknown as { name: string; campaign_id: string | null; campaigns: { id: string; name: string } | null } | null
    if (!client) continue

    if (!clientMap.has(client.id)) {
      clientMap.set(client.id, {
        clientId: client.id,
        clientName: client.business_name || client.name,
        campaigns: new Map(),
      })
    }

    const cg = clientMap.get(client.id)!
    const campaignId   = lead?.campaign_id        ?? 'unknown'
    const campaignName = lead?.campaigns?.name    ?? 'Unknown Campaign'

    if (!cg.campaigns.has(campaignId)) {
      cg.campaigns.set(campaignId, {
        campaignId, campaignName, bookings: [],
        counts: { upcoming: 0, completed: 0, cancelled: 0 },
      })
    }

    const camp = cg.campaigns.get(campaignId)!
    camp.bookings.push({
      id: b.id, scheduled_at: b.scheduled_at, completed_at: b.completed_at,
      completed_by: b.completed_by, status: b.status,
      leadName: lead?.name ?? 'Unknown',
    })
    if (b.status === 'booked')     camp.counts.upcoming++
    if (b.status === 'completed' || b.status === 'disputed') camp.counts.completed++
    if (b.status === 'cancelled')  camp.counts.cancelled++
  }

  // Serialise Maps → arrays for the client component
  const clientGroups: ClientGroupData[] = Array.from(clientMap.values()).map((g) => {
    const campaigns = Array.from(g.campaigns.values())
    const counts = campaigns.reduce(
      (acc, c) => ({
        upcoming:  acc.upcoming  + c.counts.upcoming,
        completed: acc.completed + c.counts.completed,
        cancelled: acc.cancelled + c.counts.cancelled,
      }),
      { upcoming: 0, completed: 0, cancelled: 0 },
    )
    return { clientId: g.clientId, clientName: g.clientName, campaigns, counts }
  })

  const all       = rawBookings ?? []
  const upcoming  = all.filter((b) => b.status === 'booked').length
  const completed = all.filter((b) => b.status === 'completed').length
  const cancelled = all.filter((b) => b.status === 'cancelled').length

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Bookings</h1>
        <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground">
          <span className="text-blue-600 dark:text-blue-400 font-medium">{upcoming} upcoming</span>
          <span className="text-green-600 dark:text-green-400 font-medium">{completed} completed</span>
          <span>{cancelled} cancelled</span>
        </div>
      </div>

      <AdminBookingsList clientGroups={clientGroups} />
    </div>
  )
}
