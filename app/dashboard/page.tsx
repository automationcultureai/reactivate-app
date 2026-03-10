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

  // Client dashboard requires an active Clerk org
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

  // Look up client by Clerk org ID — this is the tenancy boundary
  const { data: client } = await supabase
    .from('clients')
    .select('id, name, business_name')
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

  // Leads — name + status + date only (NO email/phone — privacy)
  const { data: leads } = await supabase
    .from('leads')
    .select('id, name, status, created_at')
    .eq('client_id', client.id)
    .not('status', 'in', '(deleted)')
    .order('created_at', { ascending: false })

  // Bookings — join to get lead name
  const { data: rawBookings } = await supabase
    .from('bookings')
    .select('*, leads(name)')
    .eq('client_id', client.id)
    .order('scheduled_at', { ascending: false })

  const bookings = (rawBookings ?? []).map((b) => ({
    ...(b as unknown as Booking),
    leadName: (b.leads as unknown as { name: string } | null)?.name ?? 'Unknown',
  }))

  // Compute aggregate stats across all campaigns for this client
  const totalLeads = (leads ?? []).length
  const allLeadIds = (leads ?? []).map((l) => l.id)

  let emailsSent = 0
  let openedCount = 0

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

    emailsSent = sent ?? 0
    openedCount = opened ?? 0
  }

  const clickedCount = (leads ?? []).filter((l) =>
    ['clicked', 'booked', 'completed'].includes(l.status)
  ).length
  const bookedCount = (leads ?? []).filter((l) => l.status === 'booked').length
  const completedCount = (leads ?? []).filter((l) => l.status === 'completed').length

  return (
    <>
      <DashboardNav clientName={clientDisplayName} />

      <main className="max-w-5xl mx-auto px-6 py-8 space-y-10">
        {/* Page header */}
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {clientDisplayName} · {totalLeads} lead{totalLeads !== 1 ? 's' : ''} across all campaigns
          </p>
        </div>

        {/* Stats overview */}
        <DashboardStats
          totalLeads={totalLeads}
          emailsSent={emailsSent}
          openedCount={openedCount}
          clickedCount={clickedCount}
          bookedCount={bookedCount}
          completedCount={completedCount}
        />

        <Separator />

        {/* Bookings with complete + dispute actions */}
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-foreground">
            Bookings
            {bookings.length > 0 && (
              <span className="text-sm font-normal text-muted-foreground ml-2">
                ({bookings.length})
              </span>
            )}
          </h2>
          <DashboardBookings bookings={bookings} />
        </div>

        <Separator />

        {/* Lead list — no email/phone shown */}
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
          <DashboardLeads leads={leads ?? []} />
        </div>
      </main>
    </>
  )
}
