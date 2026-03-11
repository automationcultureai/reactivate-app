import { getSupabaseClient } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import { buttonVariants } from '@/lib/button-variants'
import { Separator } from '@/components/ui/separator'
import { BillingCampaignTable } from '@/components/admin/BillingCampaignTable'
import { BillingMonthFilter } from '@/components/admin/BillingMonthFilter'
import { type InvoiceStatus } from '@/components/admin/BillingStatusSelect'
import { Download } from 'lucide-react'

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>
}) {
  const { month } = await searchParams

  const selectedMonth = month && /^\d{4}-\d{2}$/.test(month) ? month : null

  let dateStart: string | null = null
  let dateEnd: string | null = null
  let selectedMonthLabel: string | null = null

  if (selectedMonth) {
    const [y, m] = selectedMonth.split('-').map(Number)
    dateStart = new Date(y, m - 1, 1).toISOString()
    dateEnd   = new Date(y, m, 0, 23, 59, 59, 999).toISOString()
    selectedMonthLabel = new Date(y, m - 1, 1).toLocaleDateString('en-AU', { month: 'long', year: 'numeric' })
  }

  const supabase = getSupabaseClient()

  const baseSelect = `
    id,
    scheduled_at,
    completed_at,
    completed_by,
    commission_owed,
    commission_paid_at,
    invoice_sent_at,
    status,
    client_id,
    leads(name, campaign_id, campaigns(id, name)),
    clients(id, name, business_name, commission_per_job)
  `

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let rawBookings: any[] | null = null
  let fetchError = null

  if (selectedMonth && dateStart && dateEnd) {
    const { data, error } = await supabase
      .from('bookings')
      .select(baseSelect)
      .eq('status', 'completed')
      .gte('completed_at', dateStart)
      .lte('completed_at', dateEnd)
      .order('scheduled_at', { ascending: false })
    rawBookings = data
    fetchError = error
  } else {
    const { data, error } = await supabase
      .from('bookings')
      .select(baseSelect)
      .in('status', ['completed', 'disputed'])
      .order('scheduled_at', { ascending: false })
    rawBookings = data
    fetchError = error
  }

  if (fetchError) {
    return <div className="text-destructive text-sm">Failed to load billing data.</div>
  }

  const { data: openDisputes } = await supabase
    .from('commission_disputes')
    .select('booking_id')
    .eq('status', 'open')
  const openDisputeIds = new Set((openDisputes ?? []).map((d) => d.booking_id))

  const { data: allCampaigns } = await supabase
    .from('campaigns')
    .select('id, name, client_id')
    .order('created_at', { ascending: false })

  type BookingRow = {
    id: string; scheduled_at: string; completed_at: string | null
    completed_by: string | null; commission_owed: number; status: string
    leadName: string; campaignId: string; campaignName: string; invoiceStatus: InvoiceStatus
  }
  type CampaignGroup = { campaignId: string; campaignName: string; bookings: BookingRow[]; total: number }
  type ClientGroup   = {
    clientId: string; clientName: string; commissionPerJob: number
    campaigns: Map<string, CampaignGroup>
    totalOutstanding: number; totalInvoiced: number; totalPaid: number
  }

  const clientMap = new Map<string, ClientGroup>()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const b of (rawBookings ?? []) as any[]) {
    const client = b.clients as { id: string; name: string; business_name: string | null; commission_per_job: number } | null
    const lead   = b.leads   as { name: string; campaign_id: string | null; campaigns: { id: string; name: string } | null } | null
    if (!client) continue

    if (!clientMap.has(client.id)) {
      clientMap.set(client.id, {
        clientId: client.id, clientName: client.business_name || client.name,
        commissionPerJob: client.commission_per_job, campaigns: new Map(),
        totalOutstanding: 0, totalInvoiced: 0, totalPaid: 0,
      })
    }

    const cg = clientMap.get(client.id)!
    const campaignId   = lead?.campaign_id      ?? 'unknown'
    const campaignName = lead?.campaigns?.name  ?? 'Unknown Campaign'

    if (!cg.campaigns.has(campaignId)) {
      cg.campaigns.set(campaignId, { campaignId, campaignName, bookings: [], total: 0 })
    }

    const paid        = b.commission_paid_at as string | null
    const invoiceSent = b.invoice_sent_at    as string | null
    let invoiceStatus: InvoiceStatus = 'outstanding'
    if (paid) invoiceStatus = 'invoice_paid'
    else if (invoiceSent) invoiceStatus = 'invoice_sent'

    const row: BookingRow = {
      id: b.id, scheduled_at: b.scheduled_at, completed_at: b.completed_at,
      completed_by: b.completed_by, commission_owed: b.commission_owed,
      status: b.status, leadName: lead?.name ?? 'Unknown',
      campaignId, campaignName, invoiceStatus,
    }

    cg.campaigns.get(campaignId)!.bookings.push(row)
    cg.campaigns.get(campaignId)!.total += b.commission_owed ?? 0

    if (!(b.status === 'disputed' && openDisputeIds.has(b.id))) {
      if (invoiceStatus === 'invoice_paid')      cg.totalPaid        += b.commission_owed ?? 0
      else if (invoiceStatus === 'invoice_sent') cg.totalInvoiced    += b.commission_owed ?? 0
      else                                       cg.totalOutstanding += b.commission_owed ?? 0
    }
  }

  const clientGroups     = Array.from(clientMap.values())
  const grandOutstanding = clientGroups.reduce((s, g) => s + g.totalOutstanding, 0)
  const grandInvoiced    = clientGroups.reduce((s, g) => s + g.totalInvoiced, 0)
  const grandPaid        = clientGroups.reduce((s, g) => s + g.totalPaid, 0)
  const grandTotal       = grandOutstanding + grandInvoiced + grandPaid

  const campaignsByClient = new Map<string, typeof allCampaigns>()
  for (const c of allCampaigns ?? []) {
    if (!campaignsByClient.has(c.client_id)) campaignsByClient.set(c.client_id, [])
    campaignsByClient.get(c.client_id)!.push(c)
  }

  const fmt     = (cents: number) => `$${(cents / 100).toFixed(2)}`

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Billing</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {selectedMonthLabel
              ? `Showing completed jobs in ${selectedMonthLabel}`
              : 'Track invoice status per booking. Select a month to invoice by billing period.'}
          </p>
        </div>
        <a href="/api/billing/export" className={cn(buttonVariants({ variant: 'outline' }))}>
          <Download className="w-4 h-4 mr-2" />
          Export CSV
        </a>
      </div>

      <BillingMonthFilter selectedMonth={selectedMonth} />

      <div className="grid grid-cols-4 gap-4">
        {[
          { label: selectedMonthLabel ? `${selectedMonthLabel} total` : 'Total earned', value: fmt(grandTotal), sub: 'All completed jobs', colour: 'text-foreground' },
          { label: 'Outstanding', value: fmt(grandOutstanding), sub: 'Not yet invoiced', colour: 'text-foreground' },
          { label: 'Invoice sent', value: fmt(grandInvoiced), sub: 'Awaiting payment', colour: 'text-blue-600 dark:text-blue-400' },
          { label: 'Invoice paid', value: fmt(grandPaid), sub: 'Commission received', colour: 'text-green-600 dark:text-green-400' },
        ].map(({ label, value, sub, colour }) => (
          <div key={label} className="p-4 rounded-lg border border-border bg-card">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className={cn('text-2xl font-semibold font-mono mt-1', colour)}>{value}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>
          </div>
        ))}
      </div>

      {clientGroups.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 border border-dashed border-border rounded-lg text-center">
          <p className="text-sm text-muted-foreground">
            {selectedMonthLabel
              ? `No completed jobs in ${selectedMonthLabel}.`
              : 'No completed jobs yet.'}
          </p>
        </div>
      ) : (
        clientGroups.map((group) => {
          const clientCampaigns = campaignsByClient.get(group.clientId) ?? []
          const campaignList    = Array.from(group.campaigns.values())

          return (
            <div key={group.clientId} className="space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <h2 className="text-lg font-semibold text-foreground">{group.clientName}</h2>
                  <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                    <span className="text-xs text-muted-foreground">{fmt(group.commissionPerJob)}/job</span>
                    {group.totalOutstanding > 0 && (
                      <span className="text-xs font-medium text-foreground">{fmt(group.totalOutstanding)} outstanding</span>
                    )}
                    {group.totalInvoiced > 0 && (
                      <span className="text-xs font-medium text-blue-600 dark:text-blue-400">{fmt(group.totalInvoiced)} invoiced</span>
                    )}
                    {group.totalPaid > 0 && (
                      <span className="text-xs font-medium text-green-600 dark:text-green-400">{fmt(group.totalPaid)} paid</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {clientCampaigns.slice(0, 3).map((c) => (
                    <a
                      key={c.id}
                      href={`/api/billing/send-log/${c.id}`}
                      className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'text-xs')}
                    >
                      <Download className="w-3 h-3 mr-1" />
                      {c.name} log
                    </a>
                  ))}
                </div>
              </div>

              {campaignList.map((campaign) => (
                <BillingCampaignTable
                  key={campaign.campaignId}
                  campaignId={campaign.campaignId}
                  campaignName={campaign.campaignName}
                  bookings={campaign.bookings}
                  total={campaign.total}
                />
              ))}

              <Separator />
            </div>
          )
        })
      )}
    </div>
  )
}
