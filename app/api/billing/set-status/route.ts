import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAdminUserId } from '@/lib/auth'
import { getSupabaseClient } from '@/lib/supabase'

const schema = z.object({
  booking_ids: z.array(z.string().uuid()).min(1),
  status: z.enum(['outstanding', 'invoice_sent', 'invoice_paid']),
})

export async function POST(req: NextRequest) {
  try {
    const adminUserId = await getAdminUserId()
    if (!adminUserId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const parsed = schema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
    }

    const { booking_ids, status } = parsed.data
    const now = new Date().toISOString()

    let updates: Record<string, string | null>
    if (status === 'outstanding') {
      updates = { invoice_sent_at: null, commission_paid_at: null }
    } else if (status === 'invoice_sent') {
      updates = { invoice_sent_at: now, commission_paid_at: null }
    } else {
      updates = { commission_paid_at: now }
    }

    const supabase = getSupabaseClient()
    const { error } = await supabase
      .from('bookings')
      .update(updates)
      .in('id', booking_ids)

    if (error) {
      console.error('[billing/set-status] Update failed:', error.message)
      return NextResponse.json({ error: 'Failed to update status' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[billing/set-status] Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
