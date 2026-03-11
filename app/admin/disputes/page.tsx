import { getSupabaseClient } from '@/lib/supabase'
import { DisputesList } from '@/components/admin/DisputesList'

export default async function DisputesPage() {
  const supabase = getSupabaseClient()

  const { data: rawDisputes, error } = await supabase
    .from('commission_disputes')
    .select(`
      id,
      booking_id,
      client_id,
      reason,
      created_at,
      clients(name, business_name),
      bookings!inner(scheduled_at, commission_owed, leads(name))
    `)
    .eq('status', 'open')
    .order('created_at', { ascending: true })

  if (error) {
    return (
      <div className="text-destructive text-sm">
        Failed to load disputes. Please try again.
      </div>
    )
  }

  const disputes = (rawDisputes ?? []).map((d) => {
    const client = d.clients as unknown as { name: string; business_name: string | null } | null
    const booking = d.bookings as unknown as {
      scheduled_at: string
      commission_owed: number
      leads: { name: string } | null
    } | null

    return {
      id: d.id,
      booking_id: d.booking_id,
      client_id: d.client_id,
      reason: d.reason,
      created_at: d.created_at,
      clientName: client?.business_name || client?.name || 'Unknown client',
      scheduledAt: booking?.scheduled_at ?? '',
      commissionOwed: booking?.commission_owed ?? 0,
      leadName: booking?.leads?.name ?? 'Unknown lead',
    }
  })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Disputes</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {disputes.length} open dispute{disputes.length !== 1 ? 's' : ''}
        </p>
      </div>
      <DisputesList disputes={disputes} />
    </div>
  )
}
