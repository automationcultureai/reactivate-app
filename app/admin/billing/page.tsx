import { getSupabaseClient } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import { buttonVariants } from '@/lib/button-variants'
import { BillingMonthFilter } from '@/components/admin/BillingMonthFilter'
import { BillingClientList, type BillingClientData } from '@/components/admin/BillingClientList'
import { type InvoiceStatus } from '@/components/admin/BillingStatusSelect'
import { Download, ArrowUpDown } from 'lucide-react'
import Link from 'next/link'

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; from?: string; to?: string; sort?: string; dir?: string }>
}) {
  const { month, from, to, sort, dir } = await searchParams

  const selectedMonth = month && /^\d{4}-\d{2}$/.test(month) ? month : null
  const customFrom = from && /^\d{4}-\d{2}-\d{2}$/.test(from) ? from : null
  const customTo   = to   && /^\d{4}-\d{2}-\d{2}$/.test(to)   ? to   : null

  let dateStart: string | null = null
  let dateEnd: string | null = null
  let selectedMonthLabel: string | null = null

  if (customFrom && customTo) {
    dateStart = new Date(customFrom).toISOString()
    dateEnd   = new Date(`${customTo}T23:59:59.999`).toISOString()
    const fmtDate = (s: string) =>
      new Date(s).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
    selectedMonthLabel = `${fmtDate(customFrom)} – ${fmtDate(customTo)}`
  } else if (selectedMonth) {
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
    commission_amount,
    job_value,
    receipt_url,
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

  if ((selectedMonth || (customFrom && customTo)) && dateStart && dateEnd) {
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
    completed_by: string | null; commission_owed: number; commission_amount: number | null
    job_value: number | null; receipt_url: string | null; status: string
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
      commission_amount: b.commission_amount ?? null,
      job_value: b.job_value ?? null,
      receipt_url: b.receipt_url ?? null,
      status: b.status, leadName: lead?.name ?? 'Unknown',
      campaignId, campaignName, invoiceStatus,
    }

    const effectiveCommission = b.commission_amount ?? b.commission_owed ?? 0

    cg.campaigns.get(campaignId)!.bookings.push(row)
    cg.campaigns.get(campaignId)!.total += effectiveCommission

    if (!(b.status === 'disputed' && openDisputeIds.has(b.id))) {
      if (invoiceStatus === 'invoice_paid')      cg.totalPaid        += effectiveCommission
      else if (invoiceStatus === 'invoice_sent') cg.totalInvoiced    += effectiveCommission
      else                                       cg.totalOutstanding += effectiveCommission
    }
  }

  const clientGroups = Array.from(clientMap.values()).sort((a, b) => {
    const asc = dir !== 'desc'
    if (sort === 'outstanding') return asc ? a.totalOutstanding - b.totalOutstanding : b.totalOutstanding - a.totalOutstanding
    if (sort === 'invoiced')    return asc ? a.totalInvoiced    - b.totalInvoiced    : b.totalInvoiced    - a.totalInvoiced
    if (sort === 'paid')        return asc ? a.totalPaid        - b.totalPaid        : b.totalPaid        - a.totalPaid
    // default: name asc
    const cmp = a.clientName.localeCompare(b.clientName)
    return asc ? cmp : -cmp
  })
  const grandOutstanding = clientGroups.reduce((s, g) => s + g.totalOutstanding, 0)
  const grandInvoiced    = clientGroups.reduce((s, g) => s + g.totalInvoiced, 0)
  const grandPaid        = clientGroups.reduce((s, g) => s + g.totalPaid, 0)
  const grandTotal       = grandOutstanding + grandInvoiced + grandPaid

  const campaignsByClient = new Map<string, typeof allCampaigns>()
  for (const c of allCampaigns ?? []) {
    if (!campaignsByClient.has(c.client_id)) campaignsByClient.set(c.client_id, [])
    campaignsByClient.get(c.client_id)!.push(c)
  }

  // Serialise for BillingClientList client component
  const billingClientGroups: BillingClientData[] = clientGroups.map((g) => ({
    clientId: g.clientId,
    clientName: g.clientName,
    commissionPerJob: g.commissionPerJob,
    totalOutstanding: g.totalOutstanding,
    totalInvoiced: g.totalInvoiced,
    totalPaid: g.totalPaid,
    campaigns: Array.from(g.campaigns.values()),
    sendLogCampaigns: (campaignsByClient.get(g.clientId) ?? []).slice(0, 3).map((c) => ({ id: c.id, name: c.name })),
  }))

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

      <BillingMonthFilter selectedMonth={selectedMonth} customFrom={customFrom} customTo={customTo} />

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

      {clientGroups.length > 1 && (() => {
        const base = new URLSearchParams({ ...(month ? { month } : {}), ...(from ? { from } : {}), ...(to ? { to } : {}) })
        const sortLink = (s: string, label: string) => {
          const nextDir = sort === s && dir !== 'desc' ? 'desc' : 'asc'
          const p = new URLSearchParams(base); p.set('sort', s); p.set('dir', nextDir)
          return (
            <Link key={s} href={`?${p}`} className={cn(buttonVariants({ variant: sort === s ? 'secondary' : 'ghost', size: 'sm' }), 'text-xs gap-1.5')}>
              <ArrowUpDown className="w-3 h-3" />{label}
            </Link>
          )
        }
        return (
          <div className="flex items-center gap-1 flex-wrap">
            <span className="text-xs text-muted-foreground mr-1">Sort:</span>
            {sortLink('name', 'Name')}
            {sortLink('outstanding', 'Outstanding')}
            {sortLink('invoiced', 'Invoiced')}
            {sortLink('paid', 'Paid')}
          </div>
        )
      })()}

      {clientGroups.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 border border-dashed border-border rounded-lg text-center">
          <p className="text-sm text-muted-foreground">
            {selectedMonthLabel
              ? `No completed jobs in ${selectedMonthLabel}.`
              : 'No completed jobs yet.'}
          </p>
        </div>
      ) : (
        <BillingClientList clientGroups={billingClientGroups} />
      )}
    </div>
  )
}
