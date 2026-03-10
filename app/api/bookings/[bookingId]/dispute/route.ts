import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@clerk/nextjs/server'
import { getSupabaseClient } from '@/lib/supabase'

const disputeSchema = z.object({
  reason: z.string().min(10, 'Please provide a reason of at least 10 characters').max(2000),
})

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ bookingId: string }> }
) {
  try {
    const { orgId } = await auth()
    if (!orgId) {
      return NextResponse.json({ error: 'No active organisation' }, { status: 401 })
    }

    const { bookingId } = await params
    const body = await req.json()
    const parsed = disputeSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid input' },
        { status: 400 }
      )
    }

    const supabase = getSupabaseClient()

    // Verify booking belongs to this org's client
    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .select('id, client_id, status, clients(clerk_org_id)')
      .eq('id', bookingId)
      .single()

    if (bookingError || !booking) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
    }

    const clientData = booking.clients as unknown as { clerk_org_id: string | null }
    if (clientData.clerk_org_id !== orgId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    if (booking.status !== 'completed') {
      return NextResponse.json(
        { error: 'Only completed bookings can be disputed' },
        { status: 400 }
      )
    }

    // Insert dispute
    const { error: disputeError } = await supabase.from('commission_disputes').insert({
      booking_id: bookingId,
      client_id: booking.client_id,
      reason: parsed.data.reason,
      status: 'open',
    })

    if (disputeError) {
      console.error('[bookings/dispute] Insert failed:', disputeError.message)
      return NextResponse.json({ error: 'Failed to raise dispute' }, { status: 500 })
    }

    // Mark booking as disputed
    await supabase
      .from('bookings')
      .update({ status: 'disputed' })
      .eq('id', bookingId)

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[bookings/dispute] Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
