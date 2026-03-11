import { getSupabaseClient } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import { buttonVariants } from '@/lib/button-variants'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Separator } from '@/components/ui/separator'
import { BillingStatusSelect, type InvoiceStatus } from '@/components/admin/BillingStatusSelect'
import { Download } from 'lucide-react'

export default async function BillingPage() {
  const supabase = getSupabaseClient()

  // Fetch all completed + disputed bookings, joining campaign via leads
  const { data: rawBookings, error } = await supabase
    .from('bookings')
    .select(`
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
    `)
    .in('status', ['completed', 'disputed'])
    .order('scheduled_at', { ascending: false })

  if (error) {
    return <div className="text-destructive text-sm">Failed to load billing data.</div>
  }

  // Fetch open disputes
  const { data: openDisputes } = await supabase
    .from('commission_disputes')
    .select('booking_id')
    .eq('status', 'open')
  const openDisputeIds = new Set((openDisputes ?? []).map((d) => d.booking_id))

  // Fetch campaigns for send-log download links
  const { data: allCampaigns } = await supabase
    .from('campaigns')
    .select('id, name, client_id')
    .order('created_at', { ascending: false })

  // ── Types ──────────────────────────────────────────────────────────────────

  type BookingRow = {
    id: string
    scheduled_at: string
    completed_at: string | null
    completed_by: string | null
    commission_owed: number
    status: string
    leadName: string
    campaignId: string
    campaignName: string
    invoiceStatus: InvoiceStatus
  }

  type CampaignGroup = {
    campaignId: string
    campaignName: string
    bookings: BookingRow[]
    total: number
  }

  type ClientGroup = {
    clientId: string
    clientName: string
    commissionPerJob: number
    campaigns: Map<string, CampaignGroup>
    totalOutstanding: number
    totalInvoiced: number
    totalPaid: number
  }

  // ── Build client → campaign → booking tree ─────────────────────────────────

  const clientMap = new Map<string, ClientGroup>()

  for (const b of rawBookings ?? []) {
    const client = b.clients as unknown as {
      id: string; name: string; business_name: string | null; commission_per_job: number
    } | null
    const lead = b.leads as unknown as {
      name: string
      campaign_id: string | null
      campaigns: { id: string; name: string } | null
    } | null

    if (!client) continue

    if (!clientMap.has(client.id)) {
      clientMap.set(client.id, {
        clientId: client.id,
        clientName: client.business_name || client.name,
        commissionPerJob: client.commission_per_job,
        campaigns: new Map(),
        totalOutstanding: 0,
        totalInvoiced: 0,
        totalPaid: 0,
      })
    }

    const clientGroup = clientMap.get(client.id)!
    const campaignId = lead?.campaign_id ?? 'unknown'
    const campaignName = lead?.campaigns?.name ?? 'Unknown Campaign'

    if (!clientGroup.campaigns.has(campaignId)) {
      clientGroup.campaigns.set(campaignId, { campaignId, campaignName, bookings: [], total: 0 })
    }

    // Determine invoice status
    const paid = (b as unknown as { commission_paid_at: string | null }).commission_paid_at
    const invoiceSent = (b as unknown as { invoice_sent_at: string | null }).invoice_sent_at
    let invoiceStatus: InvoiceStatus = 'outstanding'
    if (paid) invoiceStatus = 'invoice_paid'
    else if (invoiceSent) invoiceStatus = 'invoice_sent'

    const row: BookingRow = {
      id: b.id,
      scheduled_at: b.scheduled_at,
      completed_at: b.completed_at,
      completed_by: b.completed_by,
      commission_owed: b.commission_owed,
      status: b.status,
      leadName: lead?.name ?? 'Unknown',
      campaignId,
      campaignName,
      invoiceStatus,
    }

    clientGroup.campaigns.get(campaignId)!.bookings.push(row)
    clientGroup.campaigns.get(campaignId)!.total += b.commission_owed ?? 0

    // Tally (exclude open disputes from financial totals)
    if (!(b.status === 'disputed' && openDisputeIds.has(b.id))) {
      if (invoiceStatus === 'invoice_paid') clientGroup.totalPaid += b.commission_owed ?? 0
      else if (invoiceStatus === 'invoice_sent') clientGroup.totalInvoiced += b.commission_owed ?? 0
      else clientGroup.totalOutstanding += b.commission_owed ?? 0
    }
  }

  const clientGroups = Array.from(clientMap.values())
  const grandOutstanding = clientGroups.reduce((s, g) => s + g.totalOutstanding, 0)
  const grandInvoiced = clientGroups.reduce((s, g) => s + g.totalInvoiced, 0)
  const grandPaid = clientGroups.reduce((s, g) => s + g.totalPaid, 0)

  const campaignsByClient = new Map<string, typeof allCampaigns>()
  for (const c of allCampaigns ?? []) {
    if (!campaignsByClient.has(c.client_id)) campaignsByClient.set(c.client_id, [])
    campaignsByClient.get(c.client_id)!.push(c)
  }

  const fmt = (cents: number) => `$${(cents / 100).toFixed(2)}`
  const fmtDate = (d: string | null) =>
    d ? new Date(d).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Billing</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Track invoice status per booking. Use the dropdown in each row to update.
          </p>
        </div>
        <a href="/api/billing/export" className={cn(buttonVariants({ variant: 'outline' }))}>
          <Download className="w-4 h-4 mr-2" />
          Export CSV
        </a>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        {[
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

      {/* Per-client sections */}
      {clientGroups.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 border border-dashed border-border rounded-lg text-center">
          <p className="text-sm text-muted-foreground">No completed jobs yet.</p>
        </div>
      ) : (
        clientGroups.map((group) => {
          const clientCampaigns = campaignsByClient.get(group.clientId) ?? []
          const campaignList = Array.from(group.campaigns.values())

          return (
            <div key={group.clientId} className="space-y-3">
              {/* Client header */}
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

              {/* Per-campaign booking tables */}
              {campaignList.map((campaign) => (
                <div key={campaign.campaignId} className="rounded-lg border border-border overflow-hidden">
                  <div className="px-4 py-2 bg-muted/20 border-b border-border flex items-center justify-between">
                    <p className="text-xs font-semibold text-foreground">{campaign.campaignName}</p>
                    <p className="text-xs font-mono text-muted-foreground">{fmt(campaign.total)}</p>
                  </div>
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/10">
                        <TableHead className="font-medium">Lead</TableHead>
                        <TableHead className="font-medium">Appointment</TableHead>
                        <TableHead className="font-medium">Completed</TableHead>
                        <TableHead className="font-medium">By</TableHead>
                        <TableHead className="font-medium text-right">Commission</TableHead>
                        <TableHead className="font-medium w-44">Invoice status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {campaign.bookings.map((b) => (
                        <TableRow key={b.id} className="hover:bg-muted/10">
                          <TableCell className="text-foreground text-sm">{b.leadName}</TableCell>
                          <TableCell className="text-muted-foreground text-sm">{fmtDate(b.scheduled_at)}</TableCell>
                          <TableCell className="text-muted-foreground text-sm">{fmtDate(b.completed_at)}</TableCell>
                          <TableCell className="text-muted-foreground text-sm capitalize">{b.completed_by ?? '—'}</TableCell>
                          <TableCell className="text-right font-mono text-sm font-medium">{fmt(b.commission_owed)}</TableCell>
                          <TableCell>
                            <BillingStatusSelect bookingId={b.id} initialStatus={b.invoiceStatus} />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ))}

              <Separator />
            </div>
          )
        })
      )}
    </div>
  )
}
