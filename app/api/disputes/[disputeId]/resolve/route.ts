import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAdminUserId } from '@/lib/auth'
import { getSupabaseClient } from '@/lib/supabase'

const resolveSchema = z.object({
  status: z.enum(['resolved', 'rejected']),
  admin_notes: z.string().max(2000).optional(),
})

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ disputeId: string }> }
) {
  try {
    const adminUserId = await getAdminUserId()
    if (!adminUserId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { disputeId } = await params
    const body = await req.json()
    const parsed = resolveSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid input' },
        { status: 400 }
      )
    }

    const { status, admin_notes } = parsed.data
    const supabase = getSupabaseClient()

    // Fetch the dispute + booking
    const { data: dispute, error: disputeError } = await supabase
      .from('commission_disputes')
      .select('id, booking_id, status')
      .eq('id', disputeId)
      .single()

    if (disputeError || !dispute) {
      return NextResponse.json({ error: 'Dispute not found' }, { status: 404 })
    }

    // Update the dispute record
    await supabase
      .from('commission_disputes')
      .update({ status, admin_notes: admin_notes ?? null })
      .eq('id', disputeId)

    if (status === 'resolved') {
      // Client wins — waive the commission, booking stays "disputed"
      await supabase
        .from('bookings')
        .update({ commission_owed: 0 })
        .eq('id', dispute.booking_id)
    } else {
      // Rejected — agency wins, booking reverts to "completed"
      await supabase
        .from('bookings')
        .update({ status: 'completed' })
        .eq('id', dispute.booking_id)
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[disputes/resolve] Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
