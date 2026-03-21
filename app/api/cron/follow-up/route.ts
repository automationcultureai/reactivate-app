import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseClient } from '@/lib/supabase'
import { sendEmail, sendDelay } from '@/lib/email'
import { sendSms, isTwilioConfigured } from '@/lib/twilio'
import { sendAdminAlert } from '@/lib/alert'
import { pickAbVariant, evaluateAbWinner } from '@/lib/ab-testing'
import type { Email, Lead, SmsMessage, CampaignAbTest } from '@/lib/supabase'

// Allow up to 300 seconds — cron processes all active campaigns in one run
export const maxDuration = 300

// Timing thresholds
const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000
const FIVE_DAYS_MS = 5 * 24 * 60 * 60 * 1000
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

  // Fetch all ACTIVE campaigns with any channel (email, sms, or both)
  const { data: campaigns, error: campaignsError } = await supabase
    .from('campaigns')
    .select('*, clients(name, email, business_name, business_address)')
    .eq('status', 'active')

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

    const clientEmail = clientData?.email ?? ''
    const clientBusinessName = clientData?.business_name ?? clientData?.name ?? undefined
    const clientBusinessAddress = clientData?.business_address ?? undefined

    const hasEmail = campaign.channel === 'email' || campaign.channel === 'both'
    const hasSms = campaign.channel === 'sms' || campaign.channel === 'both'

    // Fetch leads eligible for follow-up or initial send
    // pending: Email 1 / SMS 1 not yet sent (wave 2/3 deferred, or wave 1 that timed out)
    // emailed/sms_sent: Email 2/3 or SMS 2/3; clicked: Email 4 / SMS 4
    const { data: leads } = await supabase
      .from('leads')
      .select('id, name, email, phone, booking_token, status, email_opt_out, sms_opt_out, send_failure_count, rfm_wave')
      .eq('campaign_id', campaign.id)
      .in('status', ['pending', 'emailed', 'sms_sent', 'clicked'])

    if (!leads || leads.length === 0) continue

    const leadIds = leads.map((l) => l.id)

    // Fetch all emails and SMS for these leads in one query each
    const { data: allEmails } = await supabase
      .from('emails')
      .select('*')
      .in('lead_id', leadIds)
      .order('sequence_number', { ascending: true })

    const { data: allSms } = await supabase
      .from('sms_messages')
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

    // Fetch A/B test config for this campaign (all steps, enabled only)
    const { data: abTests } = await supabase
      .from('campaign_ab_tests')
      .select('*')
      .eq('campaign_id', campaign.id)
      .eq('ab_test_enabled', true)

    // Map: sequence_number → CampaignAbTest
    const abTestBySeq = new Map<number, CampaignAbTest>()
    for (const t of abTests ?? []) {
      abTestBySeq.set(t.sequence_number, t as CampaignAbTest)
    }

    // Local A/B send counters to avoid repeated DB round-trips within a campaign run
    // Map: ab_test.id → { aSends, bSends, firstSendAt }
    const abCounts = new Map<string, { aSends: number; bSends: number; firstSendAt: string | null }>()
    for (const t of abTests ?? []) {
      abCounts.set(t.id, {
        aSends: t.ab_variant_a_sends ?? 0,
        bSends: t.ab_variant_b_sends ?? 0,
        firstSendAt: t.first_send_at ?? null,
      })
    }

    // Group emails by lead_id → flat array (multiple branch variants per sequence number)
    const emailsByLead = new Map<string, Email[]>()
    for (const email of allEmails ?? []) {
      if (!emailsByLead.has(email.lead_id)) emailsByLead.set(email.lead_id, [])
      emailsByLead.get(email.lead_id)!.push(email as Email)
    }

    // Group SMS by lead_id → sequence_number
    const smsByLead = new Map<string, Record<number, SmsMessage>>()
    for (const sms of allSms ?? []) {
      if (!smsByLead.has(sms.lead_id)) smsByLead.set(sms.lead_id, {})
      smsByLead.get(sms.lead_id)![sms.sequence_number] = sms as SmsMessage
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
      // Need at least one valid contact method for the campaign's channel
      if (hasEmail && !lead.email) continue
      if (hasSms && !lead.phone) continue
      if (!hasEmail && !hasSms) continue

      const leadEmails = emailsByLead.get(lead.id) ?? []

      // Helper: find a specific email by sequence number and branch variant.
      // Falls back to null-variant if the requested branch variant doesn't exist
      // (backward compatibility for campaigns created before Feature 2).
      function getEmail(seqNum: number, branchVariant: string | null = null): Email | undefined {
        const match = leadEmails.find(
          (e) => e.sequence_number === seqNum && e.branch_variant === branchVariant
        )
        if (!match && branchVariant !== null) {
          // Fallback: pre-branching campaigns store email2/email3 with branch_variant=null
          return leadEmails.find(
            (e) => e.sequence_number === seqNum && e.branch_variant === null
          )
        }
        return match
      }

      const email1 = getEmail(1)
      const email4 = getEmail(4)

      let emailToSend: Email | undefined
      let sequenceNumber: number | undefined

      // Pending leads: Email 1 / SMS 1 not yet sent.
      // Wave 1: send on activation (days 1-2) — also covers any that timed out on initial send.
      // Wave 2: send only if campaign activated >= 3 days ago.
      // Wave 3: send only if campaign activated >= 5 days ago.
      if (lead.status === 'pending') {
        if (email1 && !email1.sent_at) {
          const wave = (lead as { rfm_wave?: number }).rfm_wave ?? 1
          const activatedAt = (campaign as { activated_at?: string | null }).activated_at
          const msSinceActivation = activatedAt ? now - new Date(activatedAt).getTime() : Infinity
          const waveReady =
            wave === 1 ||
            (wave === 2 && msSinceActivation >= THREE_DAYS_MS) ||
            (wave === 3 && msSinceActivation >= FIVE_DAYS_MS)
          if (waveReady) {
            emailToSend = email1
            sequenceNumber = 1
          }
        }
      }

      if (lead.status === 'emailed') {
        // Email 2: Email 1 sent > 3 days ago, no Email 2 sent yet for this lead.
        // Select branch variant based on lead's behaviour with Email 1.
        const anyEmail2Sent = leadEmails.some((e) => e.sequence_number === 2 && e.sent_at)
        if (email1?.sent_at && !anyEmail2Sent) {
          const msSince = now - new Date(email1.sent_at).getTime()
          if (msSince >= THREE_DAYS_MS) {
            // Determine branch: clicked > opened > unopened
            const state2 = email1.clicked_at ? '2_clicked' : email1.opened_at ? '2_opened' : '2_unopened'
            const email2 = getEmail(2, state2)
            if (email2 && !email2.sent_at) {
              emailToSend = email2
              sequenceNumber = 2
            }
          }
        }

        // Email 3: Email 1 sent > 8 days ago, Email 2 already sent, no Email 3 sent yet.
        // Select branch variant based on lead's behaviour with whichever Email 2 was sent.
        const sentEmail2 = leadEmails.find((e) => e.sequence_number === 2 && e.sent_at)
        const anyEmail3Sent = leadEmails.some((e) => e.sequence_number === 3 && e.sent_at)
        if (email1?.sent_at && sentEmail2 && !anyEmail3Sent) {
          const msSince = now - new Date(email1.sent_at).getTime()
          if (msSince >= EIGHT_DAYS_MS) {
            const state3 = sentEmail2.clicked_at ? '3_clicked' : sentEmail2.opened_at ? '3_opened' : '3_unopened'
            const email3 = getEmail(3, state3)
            if (email3 && !email3.sent_at) {
              emailToSend = email3
              sequenceNumber = 3
            }
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

      // Skip if nothing to send this run
      if (!emailToSend && !sequenceNumber) continue

      const bookingUrl = `${appUrl}/book/${lead.booking_token}`
      const now2 = new Date().toISOString()

      // Send email follow-up
      if (hasEmail && emailToSend && sequenceNumber && lead.email && !lead.email_opt_out) {
        try {
          // Apply A/B subject override if a test is active for this sequence number
          let subjectToSend = emailToSend.subject
          let abVariant: string | null = null
          const abTest = abTestBySeq.get(sequenceNumber)
          if (abTest) {
            const winner = abTest.ab_winner as 'A' | 'B' | 'inconclusive' | null
            abVariant = (winner === 'A' || winner === 'B') ? winner : pickAbVariant()
            subjectToSend =
              abVariant === 'A'
                ? (abTest.subject_variant_a ?? emailToSend.subject)
                : (abTest.subject_variant_b ?? emailToSend.subject)
            const counts = abCounts.get(abTest.id)!
            if (!counts.firstSendAt) counts.firstSendAt = now2
            if (abVariant === 'A') { counts.aSends++ } else { counts.bSends++ }
            await Promise.all([
              supabase.from('emails').update({ ab_variant_assigned: abVariant }).eq('id', emailToSend.id),
              supabase.from('campaign_ab_tests').update({
                ab_variant_a_sends: counts.aSends,
                ab_variant_b_sends: counts.bSends,
                first_send_at: counts.firstSendAt,
              }).eq('id', abTest.id),
            ])
          }

          await sendEmail({
            to: lead.email,
            subject: subjectToSend,
            body: emailToSend.body,
            bookingUrl,
            replyTo: clientEmail,
            emailId: emailToSend.id,
            leadToken: lead.booking_token,
            clientBusinessName,
            clientBusinessAddress,
          })
          await supabase.from('emails').update({ sent_at: now2 }).eq('id', emailToSend.id)
          await supabase.from('lead_events').insert({
            lead_id: lead.id,
            event_type: 'email_sent',
            description: `Email ${sequenceNumber} sent (follow-up cron)${abVariant ? ` (A/B variant ${abVariant})` : ''}`,
          })
          // Update pending leads to emailed so follow-up sequence picks them up correctly
          if (lead.status === 'pending') {
            await supabase.from('leads').update({ status: 'emailed' }).eq('id', lead.id)
          }
          totalSent++
          remainingToday--
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err)
          console.error(`[cron/follow-up] Email ${sequenceNumber} failed for lead ${lead.id}:`, message)
          await supabase.from('send_failures').insert({
            lead_id: lead.id, campaign_id: campaign.id, channel: 'email',
            sequence_number: sequenceNumber, error_message: message, attempt_count: 1, resolved: false,
          })
          await supabase.from('leads').update({ send_failure_count: (lead.send_failure_count ?? 0) + 1 }).eq('id', lead.id)
          totalFailed++
        }
      }

      // Send SMS follow-up (same sequence number, same timing rules)
      if (hasSms && sequenceNumber && lead.phone && !lead.sms_opt_out && isTwilioConfigured()) {
        const smsMap = smsByLead.get(lead.id) ?? {}
        const smsToSend = smsMap[sequenceNumber]
        if (smsToSend && !smsToSend.sent_at) {
          try {
            await sendSms(lead.phone, smsToSend.body, bookingUrl)
            await supabase.from('sms_messages').update({ sent_at: now2 }).eq('id', smsToSend.id)
            await supabase.from('lead_events').insert({
              lead_id: lead.id,
              event_type: 'sms_sent',
              description: `SMS ${sequenceNumber} sent (follow-up cron)`,
            })
            if (!hasEmail) { totalSent++; remainingToday-- }  // Count SMS-only sends
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err)
            console.error(`[cron/follow-up] SMS ${sequenceNumber} failed for lead ${lead.id}:`, message)
            await supabase.from('send_failures').insert({
              lead_id: lead.id, campaign_id: campaign.id, channel: 'sms',
              sequence_number: sequenceNumber, error_message: message, attempt_count: 1, resolved: false,
            })
            if (!hasEmail) {
              await supabase.from('leads').update({ send_failure_count: (lead.send_failure_count ?? 0) + 1 }).eq('id', lead.id)
              totalFailed++
            }
          }
        }
      }

      // Randomised delay between sends (30–60 seconds, AI_rules.md requirement)
      if (remainingToday > 0) {
        await sendDelay()
      }
    }

    // Evaluate A/B winners for any active tests in this campaign that are 4+ hours old
    for (const [seqNum] of abTestBySeq) {
      await evaluateAbWinner(supabase, campaign.id, seqNum)
    }
  }

  if (totalFailed > 0) {
    try {
      await sendAdminAlert(
        `Follow-up cron: ${totalFailed} failure${totalFailed !== 1 ? 's' : ''}`,
        `Follow-up cron completed with failures.\n\nSent: ${totalSent}\nFailed: ${totalFailed}\n\nCheck send_failures table for details.`
      )
    } catch (alertErr) {
      console.error('[cron/follow-up] Failed to send admin alert:', alertErr)
    }
  }

  return NextResponse.json({
    success: true,
    sent: totalSent,
    failed: totalFailed,
    message: `Follow-up cron complete: ${totalSent} sent, ${totalFailed} failed`,
  })
}
