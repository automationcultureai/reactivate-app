import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseClient } from '@/lib/supabase'

export const maxDuration = 300

function verifyCronSecret(req: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) return false
  return req.headers.get('authorization') === `Bearer ${cronSecret}`
}

export async function POST(req: NextRequest) {
  if (!verifyCronSecret(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = getSupabaseClient()
  const autoCompleteDays = parseInt(process.env.AUTO_COMPLETE_DAYS ?? '3', 10)

  // Find bookings that are still "booked" but scheduled more than AUTO_COMPLETE_DAYS ago
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - autoCompleteDays)

  const { data: bookings, error } = await supabase
    .from('bookings')
    .select('id, lead_id, client_id, clients(commission_per_job)')
    .eq('status', 'booked')
    .lt('scheduled_at', cutoff.toISOString())

  if (error) {
    console.error('[jobs/auto-complete] Failed to fetch bookings:', error.message)
    return NextResponse.json({ error: 'Failed to fetch bookings' }, { status: 500 })
  }

  if (!bookings || bookings.length === 0) {
    return NextResponse.json({ message: 'No bookings to auto-complete', completed: 0 })
  }

  let completed = 0
  let failed = 0
  const now = new Date().toISOString()

  for (const booking of bookings) {
    const clientData = booking.clients as unknown as { commission_per_job: number } | null
    const commissionOwed = clientData?.commission_per_job ?? 0

    const { error: bookingError } = await supabase
      .from('bookings')
      .update({
        status: 'completed',
        completed_at: now,
        completed_by: 'auto',
        commission_owed: commissionOwed,
      })
      .eq('id', booking.id)

    if (bookingError) {
      console.error(`[jobs/auto-complete] Failed to update booking ${booking.id}:`, bookingError.message)
      failed++
      continue
    }

    await supabase.from('leads').update({ status: 'completed' }).eq('id', booking.lead_id)

    await supabase.from('lead_events').insert({
      lead_id: booking.lead_id,
      event_type: 'auto_completed',
      description: `Job auto-completed after ${autoCompleteDays} days`,
    })

    completed++
  }

  return NextResponse.json({
    success: true,
    completed,
    failed,
    message: `Auto-complete cron: ${completed} completed, ${failed} failed`,
  })
}
