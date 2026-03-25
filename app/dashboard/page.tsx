export const dynamic = 'force-dynamic'

import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { getSupabaseClient } from '@/lib/supabase'
import { DashboardNav } from '@/components/dashboard/DashboardNav'
import { DashboardStats } from '@/components/dashboard/DashboardStats'
import { DashboardBookings } from '@/components/dashboard/DashboardBookings'
import { DashboardLeads } from '@/components/dashboard/DashboardLeads'
import { Separator } from '@/components/ui/separator'
import type { Booking } from '@/lib/supabase'

export default async function DashboardPage() {
  const { userId, orgId } = await auth()

  if (!userId) redirect('/sign-in')

  if (!orgId) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-3 max-w-sm px-4">
          <h1 className="text-xl font-semibold text-foreground">No organisation active</h1>
          <p className="text-sm text-muted-foreground">
            Your account hasn&apos;t been linked to a client organisation yet. Please contact
            the agency to get access.
          </p>
        </div>
      </div>
    )
  }

  const supabase = getSupabaseClient()

  const { data: client } = await supabase
    .from('clients')
    .select('id, name, business_name, commission_type, commission_value')
    .eq('clerk_org_id', orgId)
    .single()

  if (!client) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-3 max-w-sm px-4">
          <h1 className="text-xl font-semibold text-foreground">Account not found</h1>
          <p className="text-sm text-muted-foreground">
            Your organisation is not linked to a client account. Please contact the agency.
          </p>
        </div>
      </div>
    )
  }

  const clientDisplayName = client.business_name || client.name

  const { data: leads } = await supabase
    .from('leads')
    .select('id, name, status, created_at')
    .eq('client_id', client.id)
    .not('status', 'in', '(deleted)')
    .order('created_at', { ascending: false })

  const { data: rawBookings } = await supabase
    .from('bookings')
    .select('*, leads(name)')
    .eq('client_id', client.id)
    .order('scheduled_at', { ascending: false })

  const bookings = (rawBookings ?? []).map((b) => ({
    ...(b as unknown as Booking),
    leadName: (b.leads as unknown as { name: string } | null)?.name ?? 'Unknown',
  }))

  const totalLeads = (leads ?? []).length
  const allLeadIds = (leads ?? []).map((l) => l.id)

  let emailsSent = 0
  let openedCount = 0
  let smsSent = 0
  let smsOptedOut = 0

  if (allLeadIds.length > 0) {
    const { count: sent } = await supabase
      .from('emails')
      .select('id', { count: 'exact', head: true })
      .in('lead_id', allLeadIds)
      .eq('sequence_number', 1)
      .not('sent_at', 'is', null)

    const { count: opened } = await supabase
      .from('emails')
      .select('id', { count: 'exact', head: true })
      .in('lead_id', allLeadIds)
      .not('opened_at', 'is', null)

    const { count: smsCount } = await supabase
      .from('sms_messages')
      .select('id', { count: 'exact', head: true })
      .in('lead_id', allLeadIds)
      .not('sent_at', 'is', null)

    const { count: optedOut } = await supabase
      .from('leads')
      .select('id', { count: 'exact', head: true })
      .in('id', allLeadIds)
      .eq('sms_opt_out', true)

    emailsSent = sent ?? 0
    openedCount = opened ?? 0
    smsSent = smsCount ?? 0
    smsOptedOut = optedOut ?? 0
  }

  const { data: sentEmails } = allLeadIds.length > 0
    ? await supabase
        .from('emails')
        .select('lead_id, sequence_number, sent_at')
        .in('lead_id', allLeadIds)
        .not('sent_at', 'is', null)
        .order('sequence_number', { ascending: false })
    : { data: [] }

  const latestEmailByLeadMap = new Map<string, { sequence_number: number; sent_at: string }>()
  for (const e of sentEmails ?? []) {
    if (!latestEmailByLeadMap.has(e.lead_id)) {
      latestEmailByLeadMap.set(e.lead_id, { sequence_number: e.sequence_number, sent_at: e.sent_at! })
    }
  }
  const latestEmailByLead = Object.fromEntries(latestEmailByLeadMap)

  const { data: sentSms } = allLeadIds.length > 0
    ? await supabase
        .from('sms_messages')
        .select('lead_id, sequence_number, sent_at')
        .in('lead_id', allLeadIds)
        .not('sent_at', 'is', null)
        .order('sequence_number', { ascending: false })
    : { data: [] }

  const latestSmsByLeadMap = new Map<string, { sequence_number: number; sent_at: string }>()
  const smsLeadsBySeq: Record<number, Set<string>> = { 1: new Set(), 2: new Set(), 3: new Set(), 4: new Set() }
  for (const s of sentSms ?? []) {
    if (!latestSmsByLeadMap.has(s.lead_id)) {
      latestSmsByLeadMap.set(s.lead_id, { sequence_number: s.sequence_number, sent_at: s.sent_at! })
    }
    smsLeadsBySeq[s.sequence_number]?.add(s.lead_id)
  }
  const latestSmsByLead = Object.fromEntries(latestSmsByLeadMap)
  const smsSeqCounts = {
    sms1: smsLeadsBySeq[1].size,
    sms2: smsLeadsBySeq[2].size,
    sms3: smsLeadsBySeq[3].size,
    sms4: smsLeadsBySeq[4].size,
  }
  const uniqueSmsLeads = smsLeadsBySeq[1].size

  const { data: recentEvents } = allLeadIds.length > 0
    ? await supabase
        .from('lead_events')
        .select('lead_id, event_type, created_at')
        .in('lead_id', allLeadIds)
        .not('event_type', 'in', '(email_sent)')
        .order('created_at', { ascending: false })
    : { data: [] }

  const lastEventByLeadMap = new Map<string, { event_type: string; created_at: string }>()
  for (const event of recentEvents ?? []) {
    if (!lastEventByLeadMap.has(event.lead_id)) {
      lastEventByLeadMap.set(event.lead_id, event)
    }
  }
  const lastEventByLead = Object.fromEntries(lastEventByLeadMap)

  const clickedCount = (leads ?? []).filter((l) =>
    ['clicked', 'booked', 'completed'].includes(l.status)
  ).length
  const rawBookedCount = (leads ?? []).filter((l) => l.status === 'booked').length
  const completedCount = (leads ?? []).filter((l) => l.status === 'completed').length
  const bookedCount = rawBookedCount + completedCount

  const { data: allDisputes } = await supabase
    .from('commission_disputes')
    .select('booking_id, status, admin_notes, reason')
    .eq('client_id', client.id)

  const disputesByBooking = Object.fromEntries(
    (allDisputes ?? []).map(d => [d.booking_id, d])
  )

  const { data: spendData } = await supabase
    .from('bookings')
    .select('commission_amount, commission_owed')
    .eq('client_id', client.id)
    .eq('status', 'completed')

  // Use commission_amount (accurate, set at completion) where available; fall back to legacy commission_owed
  const totalSpend = (spendData ?? []).reduce(
    (sum, b) => sum + (b.commission_amount ?? b.commission_owed ?? 0),
    0
  )

  return (
    <>
      <DashboardNav clientName={clientDisplayName} />

      <main className="max-w-5xl mx-auto px-6 py-8 space-y-10">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {clientDisplayName} · {totalLeads} lead{totalLeads !== 1 ? 's' : ''} across all campaigns
          </p>
        </div>

        <DashboardStats
          totalLeads={totalLeads}
          bookedCount={bookedCount}
          emailsSent={emailsSent}
          openedCount={openedCount}
          clickedCount={clickedCount}
          completedCount={completedCount}
          totalSpend={totalSpend}
          smsSent={smsSent}
          smsOptedOut={smsOptedOut}
          uniqueSmsLeads={uniqueSmsLeads}
          smsSeqCounts={smsSeqCounts}
        />

        <Separator />

        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-foreground">
            Bookings
            {bookings.length > 0 && (
              <span className="text-sm font-normal text-muted-foreground ml-2">
                ({bookings.length})
              </span>
            )}
          </h2>
          <DashboardBookings
            bookings={bookings}
            disputesByBooking={disputesByBooking}
            commissionType={(client.commission_type as 'flat' | 'percentage') ?? 'flat'}
            commissionValue={client.commission_value ?? 0}
          />
        </div>

        <Separator />

        <div className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-foreground">
              Leads
              {leads && leads.length > 0 && (
                <span className="text-sm font-normal text-muted-foreground ml-2">
                  ({leads.length})
                </span>
              )}
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Contact details are not displayed here for privacy.
            </p>
          </div>
          <DashboardLeads leads={leads ?? []} lastEventByLead={lastEventByLead} latestEmailByLead={latestEmailByLead} latestSmsByLead={latestSmsByLead} />
        </div>
      </main>
    </>
  )
}
