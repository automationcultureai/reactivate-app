import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getSupabaseClient } from '@/lib/supabase'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ bookingId: string }> }
) {
  try {
    const { bookingId } = await params
    const { orgId } = await auth()
    if (!orgId) {
      return NextResponse.json({ error: 'No active organisation' }, { status: 401 })
    }

    const supabase = getSupabaseClient()

    // Verify the booking belongs to this org
    const { data: booking } = await supabase
      .from('bookings')
      .select('id, clients(clerk_org_id)')
      .eq('id', bookingId)
      .single()

    if (!booking) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
    }

    const clientData = booking.clients as unknown as { clerk_org_id: string | null }
    if (clientData.clerk_org_id !== orgId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const formData = await req.formData()
    const file = formData.get('file') as File | null
    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    // Sanitise filename to avoid path traversal
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const path = `receipts/${bookingId}/${safeName}`

    const arrayBuffer = await file.arrayBuffer()
    const { error: uploadError } = await supabase.storage
      .from('receipts')
      .upload(path, arrayBuffer, {
        contentType: file.type,
        upsert: true,
      })

    if (uploadError) {
      console.error('[upload-receipt] Storage upload failed:', uploadError.message)
      return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
    }

    return NextResponse.json({ receipt_url: path })
  } catch (err) {
    console.error('[upload-receipt] Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
