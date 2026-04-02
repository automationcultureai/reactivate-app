import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseClient } from '@/lib/supabase'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params
    const supabase = getSupabaseClient()

    // Look up lead by booking_token
    const { data: lead } = await supabase
      .from('leads')
      .select('id, status, campaign_id')
      .eq('booking_token', token)
      .single()

    if (!lead) {
      return NextResponse.redirect(new URL('/', process.env.NEXT_PUBLIC_APP_URL ?? 'https://reactivate-psi.vercel.app'))
    }

    if (lead.status === 'unsubscribed' || lead.status === 'deleted') {
      return NextResponse.redirect(new URL('/', process.env.NEXT_PUBLIC_APP_URL ?? 'https://reactivate-psi.vercel.app'))
    }

    // Look up campaign for external_booking_url
    const { data: campaign } = await supabase
      .from('campaigns')
      .select('external_booking_url')
      .eq('id', lead.campaign_id)
      .single()

    const externalUrl = campaign?.external_booking_url

    let destination: string

    if (externalUrl && externalUrl.trim() !== '') {
      destination = externalUrl

      // Fire-and-forget tracking for external redirect
      const now = new Date().toISOString()
      Promise.all([
        supabase
          .from('leads')
          .update({ status: 'clicked' })
          .eq('id', lead.id)
          .not('status', 'in', '(clicked,booked,completed)'),
        supabase
          .from('emails')
          .update({ clicked_at: now })
          .eq('lead_id', lead.id)
          .is('clicked_at', null),
        supabase.from('lead_events').insert({
          lead_id: lead.id,
          event_type: 'clicked',
          description: 'Lead clicked campaign link (external redirect)',
        }),
      ]).catch((err) => console.error('[track/click] Tracking error:', err))
    } else {
      // Internal booking page handles its own click tracking — do not double-log
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://reactivate-psi.vercel.app'
      destination = `${baseUrl}/book/${token}`
    }

    return NextResponse.redirect(destination)
  } catch (err) {
    console.error('[track/click] Unexpected error:', err)
    return NextResponse.redirect(new URL('/', process.env.NEXT_PUBLIC_APP_URL ?? 'https://reactivate-psi.vercel.app'))
  }
}
