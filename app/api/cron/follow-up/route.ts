import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseClient } from '@/lib/supabase'
import { sendEmail, sendDelay } from '@/lib/gmail'
import type { Email, Lead } from '@/lib/supabase'

// Allow up to 300 seconds — cron processes all active campaigns in one run
export const maxDuration = 300

// Timing thresholds
const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000
const EIGHT_DAYS_MS = 8 * 24 * 60 * 60 * 1000
const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000

function verifyCronSecret(req: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) return false
  const auth = req.headers.get('authorization')
  return auth === `Bearer ${cronSecret}`
}

export async function POST(req: NextRequest) {
  if (!verifyCronSecret(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = getSupabaseClient()
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ''
  const maxSendRetries = parseInt(process.env.MAX_SEND_RETRIES ?? '3', 10)
  const dailyLimit = parseInt(process.env.DAILY_SEND_LIMIT ?? '150', 10)

  // Count emails sent today across all campaigns (respects DAILY_SEND_LIMIT)
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)
  const { count: sentToday } = await supabase
    .from('emails')
    .select('id', { count: 'exact', head: true })
    .gte('sent_at', todayStart.toISOString())

  let remainingToday = Math.max(0, dailyLimit - (sentToday ?? 0))

  if (remainingToday === 0) {
    return NextResponse.json({
      message: 'Daily send limit already reached — no follow-ups sent today',
      sent: 0,
    })
  }

  // Fetch all ACTIVE campaigns with email channel (skip paused, draft, complete)
  const { data: campaigns, error: campaignsError } = await supabase
    .from('campaigns')
    .select('*, clients(name, email, business_name, business_address)')
    .eq('status', 'active')
    .in('channel', ['email', 'both'])

  if (campaignsError) {
    console.error('[cron/follow-up] Failed to fetch campaigns:', campaignsError.message)
    return NextResponse.json({ error: 'Failed to fetch campaigns' }, { status: 500 })
  }

  let totalSent = 0
  let totalFailed = 0

  for (const campaign of campaigns ?? []) {
    // Re-check campaign status (could have been paused after initial fetch)
    const { data: freshCampaign } = await supabase
      .from('campaigns')
      .select('status')
      .eq('id', campaign.id)
      .single()

    if (freshCampaign?.status !== 'active') {
      continue // Skip paused or otherwise changed campaigns
    }

    const clientData = campaign.clients as {
      name: string
      email: string
      business_name: string | null
      business_address: string | null
    } | null

    const clientEmail = clientData?.email ?? (process.env.GMAIL_USER ?? '')
    const clientBusinessName = clientData?.business_name ?? clientData?.name ?? undefined
    const clientBusinessAddress = clientData?.business_address ?? undefined

    // Fetch leads eligible for follow-up: "emailed" (Email 2/3) or "clicked" (Email 4)
    const { data: leads } = await supabase
      .from('leads')
      .select('id, name, email, booking_token, status, email_opt_out, send_failure_count')
      .eq('campaign_id', campaign.id)
      .in('status', ['emailed', 'clicked'])
      .eq('email_opt_out', false)

    if (!leads || leads.length === 0) continue

    const leadIds = leads.map((l) => l.id)

    // Fetch all emails for these leads in one query
    const { data: allEmails } = await supabase
      .from('emails')
      .select('*')
      .in('lead_id', leadIds)
      .order('sequence_number', { ascending: true })

    // Fetch most recent "clicked" event per lead (for Email 4 timing)
    const { data: clickEvents } = await supabase
      .from('lead_events')
      .select('lead_id, created_at')
      .in('lead_id', leadIds)
      .eq('event_type', 'clicked')
      .order('created_at', { ascending: false })

    // Group emails by lead_id → sequence_number
    const emailsByLead = new Map<string, Record<number, Email>>()
    for (const email of allEmails ?? []) {
      if (!emailsByLead.has(email.lead_id)) emailsByLead.set(email.lead_id, {})
      emailsByLead.get(email.lead_id)![email.sequence_number] = email as Email
    }

    // Most recent click timestamp per lead
    const lastClickByLead = new Map<string, number>()
    for (const event of clickEvents ?? []) {
      if (!lastClickByLead.has(event.lead_id)) {
        lastClickByLead.set(event.lead_id, new Date(event.created_at).getTime())
      }
    }

    const now = Date.now()

    for (const lead of leads as Lead[]) {
      if (remainingToday <= 0) break // Daily limit reached

      // ===== ALL SAFETY CHECKS BEFORE EVERY SEND (AI_rules.md) =====
      if (lead.email_opt_out) continue
      if (lead.status === 'deleted' || lead.status === 'unsubscribed') continue
      if (lead.send_failure_count >= maxSendRetries) continue
      if (!lead.email) continue

      const emails = emailsByLead.get(lead.id) ?? {}
      const email1 = emails[1]
      const email2 = emails[2]
      const email3 = emails[3]
      const email4 = emails[4]

      let emailToSend: Email | undefined
      let sequenceNumber: number | undefined

      if (lead.status === 'emailed') {
        // Email 2: Email 1 sent > 3 days ago, Email 2 not sent yet
        if (email1?.sent_at && email2 && !email2.sent_at) {
          const msSince = now - new Date(email1.sent_at).getTime()
          if (msSince >= THREE_DAYS_MS) {
            emailToSend = email2
            sequenceNumber = 2
          }
        }

        // Email 3: Email 1 sent > 8 days ago, Email 3 not sent yet
        // Only send if Email 2 is already sent (preserve correct sequence)
        if (
          email1?.sent_at &&
          email2?.sent_at &&
          email3 &&
          !email3.sent_at
        ) {
          const msSince = now - new Date(email1.sent_at).getTime()
          if (msSince >= EIGHT_DAYS_MS) {
            emailToSend = email3
            sequenceNumber = 3
          }
        }
      }

      if (lead.status === 'clicked') {
        // Email 4: Lead clicked booking page > 24hrs ago, hasn't booked, Email 4 not sent
        const lastClick = lastClickByLead.get(lead.id)
        if (lastClick && email4 && !email4.sent_at) {
          const msSinceClick = now - lastClick
          if (msSinceClick >= TWENTY_FOUR_HOURS_MS) {
            emailToSend = email4
            sequenceNumber = 4
          }
        }
      }

      if (!emailToSend || !sequenceNumber) continue

      const bookingUrl = `${appUrl}/book/${lead.booking_token}`

      try {
        await sendEmail({
          to: lead.email!,
          subject: emailToSend.subject,
          body: emailToSend.body,
          bookingUrl,
          replyTo: clientEmail,
          emailId: emailToSend.id,
          leadToken: lead.booking_token,
          clientBusinessName,
          clientBusinessAddress,
        })

        // Record sent_at
        await supabase
          .from('emails')
          .update({ sent_at: new Date().toISOString() })
          .eq('id', emailToSend.id)

        // Log event
        await supabase.from('lead_events').insert({
          lead_id: lead.id,
          event_type: 'email_sent',
          description: `Email ${sequenceNumber} sent (follow-up cron)`,
        })

        totalSent++
        remainingToday--
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        console.error(
          `[cron/follow-up] Failed to send Email ${sequenceNumber} to lead ${lead.id}:`,
          message
        )

        await supabase.from('send_failures').insert({
          lead_id: lead.id,
          campaign_id: campaign.id,
          channel: 'email',
          sequence_number: sequenceNumber,
          error_message: message,
          attempt_count: 1,
          resolved: false,
        })

        await supabase
          .from('leads')
          .update({ send_failure_count: (lead.send_failure_count ?? 0) + 1 })
          .eq('id', lead.id)

        totalFailed++
      }

      // Randomised delay between sends (30–60 seconds, AI_rules.md requirement)
      if (remainingToday > 0) {
        await sendDelay()
      }
    }
  }

  return NextResponse.json({
    success: true,
    sent: totalSent,
    failed: totalFailed,
    message: `Follow-up cron complete: ${totalSent} sent, ${totalFailed} failed`,
  })
}
