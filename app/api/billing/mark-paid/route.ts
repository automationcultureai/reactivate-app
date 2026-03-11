import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAdminUserId } from '@/lib/auth'
import { getSupabaseClient } from '@/lib/supabase'

const markPaidSchema = z.object({
  // Pass either a specific list of booking IDs, or a client_id to mark ALL unpaid as paid
  booking_ids: z.array(z.string().uuid()).optional(),
  client_id: z.string().uuid().optional(),
  paid: z.boolean().default(true),  // true = mark paid, false = unmark (revert to outstanding)
}).refine((d) => d.booking_ids?.length || d.client_id, {
  message: 'Provide either booking_ids or client_id',
})

export async function POST(req: NextRequest) {
  try {
    const adminUserId = await getAdminUserId()
    if (!adminUserId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const parsed = markPaidSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid input' },
        { status: 400 }
      )
    }

    const { booking_ids, client_id, paid } = parsed.data
    const supabase = getSupabaseClient()
    const now = paid ? new Date().toISOString() : null

    let query = supabase
      .from('bookings')
      .update({ commission_paid_at: now })
      .in('status', ['completed'])  // only mark completed bookings as paid

    if (booking_ids?.length) {
      query = query.in('id', booking_ids)
    } else if (client_id) {
      query = query.eq('client_id', client_id)
      if (paid) {
        // Only mark unpaid ones when marking all for a client
        query = query.is('commission_paid_at', null)
      }
    }

    const { error } = await query

    if (error) {
      console.error('[billing/mark-paid] Update failed:', error.message)
      return NextResponse.json({ error: 'Failed to update payment status' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[billing/mark-paid] Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
