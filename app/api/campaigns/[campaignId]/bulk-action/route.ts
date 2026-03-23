import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAdminUserId } from '@/lib/auth'
import { getSupabaseClient } from '@/lib/supabase'
import { sendEmail } from '@/lib/email'
import { sendSms, isTwilioConfigured } from '@/lib/twilio'

const bodySchema = z.object({
  lead_ids: z.array(z.string().uuid()).min(1).max(500),
  action: z.enum(['send_next_email', 'send_next_sms', 'unsubscribe']),
})

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ campaignId: string }> }
) {
  try {
    const adminUserId = await getAdminUserId()
    if (!adminUserId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { campaignId } = await params
    const supabase = getSupabaseClient()

    const { data: campaign } = await supabase
      .from('campaigns')
      .select('*, clients(name, email, business_name, business_address)')
      .eq('id', campaignId)
      .single()

    if (!campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
    }

    const body = await req.json()
    const parsed = bodySchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
    }

    const { lead_ids, action } = parsed.data

    // ── UNSUBSCRIBE ────────────────────────────────────────────────
    if (action === 'unsubscribe') {
      const { data: leads, error: fetchErr } = await supabase
        .from('leads')
        .select('id')
        .eq('campaign_id', campaignId)
        .in('id', lead_ids)
        .not('status', 'in', '(deleted,unsubscribed)')

      if (fetchErr || !leads) {
        return NextResponse.json({ error: 'Failed to fetch leads' }, { status: 500 })
      }

      const ids = leads.map((l) => l.id)
      await supabase
        .from('leads')
        .update({ email_opt_out: true, status: 'unsubscribed' })
        .in('id', ids)

      const events = ids.map((leadId) => ({
        lead_id: leadId,
        event_type: 'unsubscribed',
        description: 'Bulk unsubscribed by admin',
      }))
      if (events.length > 0) await supabase.from('lead_events').insert(events)

      return NextResponse.json({ success: true, affected: ids.length })
    }

    // ── SEND NEXT EMAIL / SMS ──────────────────────────────────────
    if (!['active', 'paused'].includes(campaign.status)) {
      return NextResponse.json(
        { error: 'Campaign must be active or paused to send emails' },
        { status: 400 }
      )
    }

    const client = campaign.clients as {
      name: string
      email: string
      business_name: string | null
      business_address: string | null
    } | null

    const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/$/, '')
    const clientBusinessName = client?.business_name ?? client?.name ?? 'the business'
    const clientBusinessAddress = client?.business_address ?? undefined

    const { data: leads, error: fetchErr } = await supabase
      .from('leads')
      .select('id, name, email, phone, booking_token, email_opt_out, status')
      .eq('campaign_id', campaignId)
      .in('id', lead_ids)
      .not('status', 'in', '(deleted,unsubscribed)')

    if (fetchErr || !leads) {
      return NextResponse.json({ error: 'Failed to fetch leads' }, { status: 500 })
    }

    let sent = 0
    let skipped = 0

    for (const lead of leads) {
      if (lead.email_opt_out) { skipped++; continue }

      if (action === 'send_next_email') {
        if (!lead.email) { skipped++; continue }

        const { data: nextEmail } = await supabase
          .from('emails')
          .select('id, sequence_number, subject, body')
          .eq('lead_id', lead.id)
          .is('sent_at', null)
          .is('branch_variant', null)
          .order('sequence_number', { ascending: true })
          .limit(1)
          .single()

        if (!nextEmail) { skipped++; continue }

        const bookingUrl = `${appUrl}/book/${lead.booking_token}`
        try {
          await sendEmail({
            to: lead.email,
            subject: nextEmail.subject,
            body: nextEmail.body,
            bookingUrl,
            replyTo: client?.email ?? '',
            emailId: nextEmail.id,
            leadToken: lead.booking_token,
            clientBusinessName,
            clientBusinessAddress,
          })
          await supabase.from('emails').update({ sent_at: new Date().toISOString() }).eq('id', nextEmail.id)
          if (lead.status === 'pending') {
            await supabase.from('leads').update({ status: 'emailed' }).eq('id', lead.id)
          }
          await supabase.from('lead_events').insert({
            lead_id: lead.id,
            event_type: 'email_sent',
            description: `Email ${nextEmail.sequence_number} sent (bulk action)`,
          })
          sent++
        } catch (err) {
          console.error(`[bulk-action] Email failed for lead ${lead.id}:`, err)
          skipped++
        }
      }

      if (action === 'send_next_sms') {
        if (!isTwilioConfigured()) { skipped++; continue }
        if (!lead.phone) { skipped++; continue }

        const { data: nextSms } = await supabase
          .from('sms_messages')
          .select('id, sequence_number, body')
          .eq('lead_id', lead.id)
          .is('sent_at', null)
          .order('sequence_number', { ascending: true })
          .limit(1)
          .single()

        if (!nextSms) { skipped++; continue }

        const bookingUrl = `${appUrl}/book/${lead.booking_token}`
        const smsBody = nextSms.body.replace(/\[BOOKING_LINK\]/g, bookingUrl)
        try {
          await sendSms({ to: lead.phone, body: smsBody })
          await supabase.from('sms_messages').update({ sent_at: new Date().toISOString() }).eq('id', nextSms.id)
          await supabase.from('lead_events').insert({
            lead_id: lead.id,
            event_type: 'sms_sent',
            description: `SMS ${nextSms.sequence_number} sent (bulk action)`,
          })
          sent++
        } catch (err) {
          console.error(`[bulk-action] SMS failed for lead ${lead.id}:`, err)
          skipped++
        }
      }
    }

    return NextResponse.json({ success: true, sent, skipped })
  } catch (err) {
    console.error('[bulk-action] Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
