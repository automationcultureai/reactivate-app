import { NextRequest, NextResponse } from 'next/server'
import { getAdminUserId } from '@/lib/auth'
import { getSupabaseClient } from '@/lib/supabase'
import { sendEmail } from '@/lib/gmail'

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const adminUserId = await getAdminUserId()
    if (!adminUserId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: leadId } = await params
    const supabase = getSupabaseClient()

    // Fetch lead with campaign and client
    const { data: lead, error: leadError } = await supabase
      .from('leads')
      .select('*, campaigns(*, clients(name, email, business_name, business_address))')
      .eq('id', leadId)
      .single()

    if (leadError || !lead) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
    }

    // Safety checks
    if (lead.status === 'deleted') {
      return NextResponse.json({ error: 'Cannot send to a deleted lead' }, { status: 400 })
    }
    if (lead.status === 'unsubscribed') {
      return NextResponse.json({ error: 'Lead has unsubscribed' }, { status: 400 })
    }
    if (lead.email_opt_out) {
      return NextResponse.json({ error: 'Lead has opted out of email' }, { status: 400 })
    }
    if (!lead.email) {
      return NextResponse.json({ error: 'Lead has no email address' }, { status: 400 })
    }

    const campaign = lead.campaigns as {
      status: string
      channel: string
      clients: {
        name: string
        email: string
        business_name: string | null
        business_address: string | null
      } | null
    } | null

    if (!campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
    }

    if (campaign.status !== 'active' && campaign.status !== 'paused') {
      return NextResponse.json(
        { error: `Campaign is "${campaign.status}" — can only send for active or paused campaigns` },
        { status: 400 }
      )
    }

    const clientData = campaign.clients
    const clientEmail = clientData?.email ?? (process.env.GMAIL_USER ?? '')
    const clientBusinessName = clientData?.business_name ?? clientData?.name ?? undefined
    const clientBusinessAddress = clientData?.business_address ?? undefined
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ''

    // Find the next unsent email (lowest sequence_number where sent_at IS NULL)
    const { data: emails, error: emailsError } = await supabase
      .from('emails')
      .select('id, sequence_number, subject, body, sent_at')
      .eq('lead_id', leadId)
      .is('sent_at', null)
      .order('sequence_number', { ascending: true })
      .limit(1)

    if (emailsError) {
      console.error('[leads/send-next] Failed to fetch emails:', emailsError.message)
      return NextResponse.json({ error: 'Failed to fetch email sequence' }, { status: 500 })
    }

    if (!emails || emails.length === 0) {
      return NextResponse.json({ error: 'No unsent emails remaining in sequence' }, { status: 400 })
    }

    const nextEmail = emails[0]
    const bookingUrl = `${appUrl}/book/${lead.booking_token}`
    const now = new Date().toISOString()

    // Send the email
    await sendEmail({
      to: lead.email,
      subject: nextEmail.subject,
      body: nextEmail.body,
      bookingUrl,
      replyTo: clientEmail,
      emailId: nextEmail.id,
      leadToken: lead.booking_token,
      clientBusinessName,
      clientBusinessAddress,
    })

    // Mark email as sent
    await supabase.from('emails').update({ sent_at: now }).eq('id', nextEmail.id)

    // Log event
    await supabase.from('lead_events').insert({
      lead_id: leadId,
      event_type: 'email_sent',
      description: `Email ${nextEmail.sequence_number} sent manually by admin to ${lead.email}`,
    })

    // Update lead status to emailed if still pending
    if (lead.status === 'pending') {
      await supabase.from('leads').update({ status: 'emailed' }).eq('id', leadId)
    }

    return NextResponse.json({ success: true, sequence_number: nextEmail.sequence_number })
  } catch (err) {
    console.error('[leads/send-next] Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
