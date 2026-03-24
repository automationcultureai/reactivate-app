import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@clerk/nextjs/server'
import { getAdminUserId } from '@/lib/auth'
import { getSupabaseClient } from '@/lib/supabase'

const completeSchema = z.object({
  bookingId: z.string().uuid(),
  completedBy: z.enum(['client', 'admin']),
  job_value: z.number().nonnegative().optional(),
})

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const parsed = completeSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid input' },
        { status: 400 }
      )
    }

    const { bookingId, completedBy, job_value } = parsed.data
    const supabase = getSupabaseClient()

    // Fetch the booking + client commission rate
    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .select('id, lead_id, client_id, status, clients(commission_per_job, commission_type, commission_value, clerk_org_id)')
      .eq('id', bookingId)
      .single()

    if (bookingError || !booking) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
    }

    if (booking.status === 'completed') {
      return NextResponse.json({ error: 'Booking already completed' }, { status: 409 })
    }

    if (booking.status === 'cancelled') {
      return NextResponse.json({ error: 'Cannot complete a cancelled booking' }, { status: 400 })
    }

    const clientData = booking.clients as unknown as {
      commission_per_job: number
      commission_type: 'flat' | 'percentage'
      commission_value: number
      clerk_org_id: string | null
    }

    // Auth: client can only complete their own org's bookings
    if (completedBy === 'client') {
      const { orgId } = await auth()
      if (!orgId) {
        return NextResponse.json({ error: 'No active organisation' }, { status: 401 })
      }
      if (orgId !== clientData.clerk_org_id) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
    }

    // Auth: admin path
    if (completedBy === 'admin') {
      const adminUserId = await getAdminUserId()
      if (!adminUserId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
    }

    const now = new Date().toISOString()

    // Calculate commission
    const job_value_cents = job_value != null ? Math.round(job_value * 100) : null
    let commission_amount: number
    if (clientData.commission_type === 'flat') {
      commission_amount = clientData.commission_value
    } else {
      commission_amount = job_value_cents != null
        ? Math.round(job_value_cents * clientData.commission_value / 10000)
        : 0
    }

    // Mark booking complete
    await supabase
      .from('bookings')
      .update({
        status: 'completed',
        completed_at: now,
        completed_by: completedBy,
        commission_owed: clientData.commission_per_job,
        job_value: job_value_cents,
        commission_amount,
      })
      .eq('id', bookingId)

    // Update lead status
    await supabase
      .from('leads')
      .update({ status: 'completed' })
      .eq('id', booking.lead_id)

    // Log event
    await supabase.from('lead_events').insert({
      lead_id: booking.lead_id,
      event_type: 'completed',
      description: `Job marked complete by ${completedBy}`,
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[jobs/complete] Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
