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
    const clientEmail = client?.email ?? ''
    const clientBusinessName = client?.business_name ?? client?.name ?? 'the business'
    const clientBusinessAddress = client?.business_address ?? undefined

    const { data: leads, error: fetchErr } = await supabase
      .from('leads')
      .select('id, name, email, phone, booking_token, email_opt_out, sms_opt_out, status')
      .eq('campaign_id', campaignId)
      .in('id', lead_ids)
      .not('status', 'in', '(deleted,unsubscribed)')

    if (fetchErr || !leads) {
      return NextResponse.json({ error: 'Failed to fetch leads' }, { status: 500 })
    }

    let sent = 0
    let skipped = 0

    if (action === 'send_next_email') {
      // Fetch all emails for all selected leads in one query
      const { data: allEmails } = await supabase
        .from('emails')
        .select('id, lead_id, sequence_number, branch_variant, subject, body, sent_at, opened_at')
        .in('lead_id', lead_ids)

      const emailsByLead = new Map<string, typeof allEmails>()
      for (const e of allEmails ?? []) {
        if (!emailsByLead.has(e.lead_id)) emailsByLead.set(e.lead_id, [])
        emailsByLead.get(e.lead_id)!.push(e)
      }

      for (const lead of leads) {
        if (lead.email_opt_out || !lead.email) { skipped++; continue }

        const leadEmails = emailsByLead.get(lead.id) ?? []
        const sentSeqNums = new Set(leadEmails.filter((e) => e.sent_at).map((e) => e.sequence_number))
        // Email 4 is only for leads who clicked the booking link — gate it on status
        const hasClicked = ['clicked', 'booked', 'completed'].includes(lead.status)
        const nextSeqNum = ([1, 2, 3, 4] as const).find(
          (s) => !sentSeqNums.has(s) && (s !== 4 || hasClicked)
        )

        if (nextSeqNum === undefined) { skipped++; continue }

        let nextEmail: typeof leadEmails[number] | undefined

        if (nextSeqNum === 1 || nextSeqNum === 4) {
          nextEmail = leadEmails.find(
            (e) => e.sequence_number === nextSeqNum && e.branch_variant === null && !e.sent_at
          )
        } else {
          const hasOpened = hasClicked || leadEmails.some((e) => e.opened_at)
          const variantSuffix = hasClicked ? 'clicked' : hasOpened ? 'opened' : 'unopened'
          nextEmail = leadEmails.find(
            (e) => e.sequence_number === nextSeqNum && e.branch_variant === `${nextSeqNum}_${variantSuffix}` && !e.sent_at
          )
        }

        if (!nextEmail) { skipped++; continue }

        const bookingUrl = `${appUrl}/book/${lead.booking_token}`
        try {
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
    }

    if (action === 'send_next_sms') {
      if (!isTwilioConfigured()) {
        return NextResponse.json({ error: 'Twilio is not configured' }, { status: 500 })
      }

      // Fetch all SMS for all selected leads in one query
      const { data: allSms } = await supabase
        .from('sms_messages')
        .select('id, lead_id, sequence_number, body, sent_at')
        .in('lead_id', lead_ids)

      const smsByLead = new Map<string, typeof allSms>()
      for (const s of allSms ?? []) {
        if (!smsByLead.has(s.lead_id)) smsByLead.set(s.lead_id, [])
        smsByLead.get(s.lead_id)!.push(s)
      }

      for (const lead of leads) {
        if (lead.sms_opt_out || !lead.phone) { skipped++; continue }

        const leadSms = smsByLead.get(lead.id) ?? []
        const nextSms = leadSms
          .filter((s) => !s.sent_at)
          .sort((a, b) => a.sequence_number - b.sequence_number)[0]

        if (!nextSms) { skipped++; continue }

        const bookingUrl = `${appUrl}/book/${lead.booking_token}`
        try {
          await sendSms(lead.phone, nextSms.body, bookingUrl)
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
