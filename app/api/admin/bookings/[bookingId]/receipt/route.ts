import { NextRequest, NextResponse } from 'next/server'
import { getAdminUserId } from '@/lib/auth'
import { getSupabaseClient } from '@/lib/supabase'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ bookingId: string }> },
) {
  try {
    await getAdminUserId()
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { bookingId } = await params
  const supabase = getSupabaseClient()

  const { data: booking, error } = await supabase
    .from('bookings')
    .select('receipt_url')
    .eq('id', bookingId)
    .single()

  if (error || !booking?.receipt_url) {
    return NextResponse.json({ error: 'No receipt found' }, { status: 404 })
  }

  const { data: signed, error: signError } = await supabase.storage
    .from('receipts')
    .createSignedUrl(booking.receipt_url, 3600)

  if (signError || !signed?.signedUrl) {
    return NextResponse.json({ error: 'Failed to generate receipt URL' }, { status: 500 })
  }

  return NextResponse.json({ signedUrl: signed.signedUrl })
}
