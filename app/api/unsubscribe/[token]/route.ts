import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseClient } from '@/lib/supabase'

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params

    if (!token) {
      return NextResponse.json({ error: 'Token is required' }, { status: 400 })
    }

    const supabase = getSupabaseClient()

    // Look up lead by booking_token
    const { data: lead, error: leadError } = await supabase
      .from('leads')
      .select('id, email_opt_out, status')
      .eq('booking_token', token)
      .single()

    if (leadError || !lead) {
      // Return success even for invalid tokens — no information leakage
      return NextResponse.json({ success: true, already_unsubscribed: false })
    }

    // Idempotent — already opted out, just confirm
    if (lead.email_opt_out) {
      return NextResponse.json({ success: true, already_unsubscribed: true })
    }

    // Set email_opt_out = true and update status
    const { error: updateError } = await supabase
      .from('leads')
      .update({
        email_opt_out: true,
        status: 'unsubscribed',
      })
      .eq('id', lead.id)

    if (updateError) {
      console.error('[unsubscribe] Failed to update lead:', updateError.message)
      return NextResponse.json({ error: 'Failed to process unsubscribe request' }, { status: 500 })
    }

    // Log event
    await supabase.from('lead_events').insert({
      lead_id: lead.id,
      event_type: 'unsubscribed',
      description: 'Lead unsubscribed via email link',
    })

    return NextResponse.json({ success: true, already_unsubscribed: false })
  } catch (err) {
    console.error('[unsubscribe] Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
