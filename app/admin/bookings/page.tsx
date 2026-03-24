import { getSupabaseClient } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Separator } from '@/components/ui/separator'

const STATUS_BADGE: Record<string, { label: string; classes: string }> = {
  booked:    { label: 'Upcoming',   classes: 'bg-blue-500/10 text-blue-600 dark:text-blue-400' },
  completed: { label: 'Completed',  classes: 'bg-green-500/10 text-green-600 dark:text-green-400' },
  cancelled: { label: 'Cancelled',  classes: 'bg-muted text-muted-foreground' },
  disputed:  { label: 'Disputed',   classes: 'bg-amber-500/10 text-amber-600 dark:text-amber-400' },
}

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

  // Group: client → campaign → bookings
  type BookingRow = {
    id: string
    scheduled_at: string
    completed_at: string | null
    completed_by: string | null
    status: string
    leadName: string
    campaignId: string
    campaignName: string
  }

  type CampaignGroup = { campaignId: string; campaignName: string; bookings: BookingRow[] }
  type ClientGroup   = { clientId: string; clientName: string; campaigns: Map<string, CampaignGroup> }

  const clientMap = new Map<string, ClientGroup>()

  for (const b of rawBookings ?? []) {
    const client = b.clients as unknown as { id: string; name: string; business_name: string | null } | null
    const lead   = b.leads   as unknown as { name: string; campaign_id: string | null; campaigns: { id: string; name: string } | null } | null

    if (!client) continue

    if (!clientMap.has(client.id)) {
      clientMap.set(client.id, {
        clientId:   client.id,
        clientName: client.business_name || client.name,
        campaigns:  new Map(),
      })
    }

    const cg = clientMap.get(client.id)!
    const campaignId   = lead?.campaign_id  ?? 'unknown'
    const campaignName = lead?.campaigns?.name ?? 'Unknown Campaign'

    if (!cg.campaigns.has(campaignId)) {
      cg.campaigns.set(campaignId, { campaignId, campaignName, bookings: [] })
    }

    cg.campaigns.get(campaignId)!.bookings.push({
      id: b.id,
      scheduled_at: b.scheduled_at,
      completed_at: b.completed_at,
      completed_by: b.completed_by,
      status: b.status,
      leadName: lead?.name ?? 'Unknown',
      campaignId,
      campaignName,
    })
  }

  const clientGroups = Array.from(clientMap.values())

  // Summary counts
  const all = rawBookings ?? []
  const upcoming  = all.filter((b) => b.status === 'booked').length
  const completed = all.filter((b) => b.status === 'completed').length
  const cancelled = all.filter((b) => b.status === 'cancelled').length

  const fmtDate = (d: string | null) =>
    d ? new Date(d).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Bookings</h1>
        <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground">
          <span className="text-blue-600 dark:text-blue-400 font-medium">{upcoming} upcoming</span>
          <span className="text-green-600 dark:text-green-400 font-medium">{completed} completed</span>
          <span>{cancelled} cancelled</span>
        </div>
      </div>

      {/* Per-client / per-campaign */}
      {clientGroups.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 border border-dashed border-border rounded-lg text-center">
          <p className="text-sm text-muted-foreground">No bookings yet.</p>
        </div>
      ) : (
        clientGroups.map((group) => (
          <div key={group.clientId} className="space-y-3">
            <h2 className="text-lg font-semibold text-foreground">{group.clientName}</h2>

            {Array.from(group.campaigns.values()).map((campaign) => {
              const counts = {
                upcoming:  campaign.bookings.filter((b) => b.status === 'booked').length,
                completed: campaign.bookings.filter((b) => b.status === 'completed').length,
                cancelled: campaign.bookings.filter((b) => b.status === 'cancelled').length,
              }

              return (
                <div key={campaign.campaignId} className="rounded-lg border border-border overflow-hidden">
                  <div className="px-4 py-2 bg-muted/20 border-b border-border flex items-center justify-between">
                    <p className="text-xs font-semibold text-foreground">{campaign.campaignName}</p>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      {counts.upcoming  > 0 && <span className="text-blue-600 dark:text-blue-400">{counts.upcoming} upcoming</span>}
                      {counts.completed > 0 && <span className="text-green-600 dark:text-green-400">{counts.completed} completed</span>}
                      {counts.cancelled > 0 && <span>{counts.cancelled} cancelled</span>}
                    </div>
                  </div>
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/10">
                        <TableHead className="font-medium w-[25%]">Lead</TableHead>
                        <TableHead className="font-medium w-[25%]">Scheduled</TableHead>
                        <TableHead className="font-medium w-[25%]">Completed</TableHead>
                        <TableHead className="font-medium w-[10%]">By</TableHead>
                        <TableHead className="font-medium w-[15%]">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {campaign.bookings.map((b) => {
                        const badge = STATUS_BADGE[b.status] ?? { label: b.status, classes: 'bg-muted text-muted-foreground' }
                        return (
                          <TableRow key={b.id} className="hover:bg-muted/10">
                            <TableCell className="font-medium text-foreground text-sm">{b.leadName}</TableCell>
                            <TableCell className="text-muted-foreground text-sm">{fmtDate(b.scheduled_at)}</TableCell>
                            <TableCell className="text-muted-foreground text-sm">{fmtDate(b.completed_at)}</TableCell>
                            <TableCell className="text-muted-foreground text-sm capitalize">{b.completed_by ?? '—'}</TableCell>
                            <TableCell>
                              <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium', badge.classes)}>
                                {badge.label}
                              </span>
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </div>
              )
            })}

            <Separator />
          </div>
        ))
      )}
    </div>
  )
}
