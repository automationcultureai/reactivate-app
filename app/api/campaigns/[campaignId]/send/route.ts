import { NextRequest, NextResponse } from 'next/server'
import { getAdminUserId } from '@/lib/auth'
import { getSupabaseClient } from '@/lib/supabase'
import { sendEmail, sendDelay } from '@/lib/email'
import { sendSms, isTwilioConfigured } from '@/lib/twilio'
import { pickAbVariant } from '@/lib/ab-testing'
import { isEmailOptimalNow } from '@/lib/sydney-time'

// Allow up to 300 seconds on Vercel Pro
// Note: 30–60s delay × leads means ~5–8 emails per invocation at max duration
export const maxDuration = 300

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ campaignId: string }> }
) {
  try {
    // 1. Admin auth
    const adminUserId = await getAdminUserId()
    if (!adminUserId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { campaignId } = await params
    const supabase = getSupabaseClient()

    // 2. Fetch campaign + client (include business_name + business_address for email footer)
    const { data: campaign, error: campaignError } = await supabase
      .from('campaigns')
      .select('*, clients(name, email, business_name, business_address)')
      .eq('id', campaignId)
      .single()

    if (campaignError || !campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
    }

    // 3. Campaign must be "ready" — admin must explicitly approve before sending
    if (campaign.status !== 'ready') {
      return NextResponse.json(
        { error: `Cannot send: campaign status is "${campaign.status}" — must be "ready"` },
        { status: 400 }
      )
    }

    // 3b. Time-of-day gate: Email 1 open rates peak Mon–Fri 9am–2pm AEST/AEDT.
    // If outside that window, activate the campaign so the follow-up cron picks it up
    // at the next optimal window — no emails sent now.
    if (!isEmailOptimalNow()) {
      const activatedAt = new Date().toISOString()
      await supabase.from('campaigns').update({ status: 'active', activated_at: activatedAt }).eq('id', campaignId)
      return NextResponse.json({
        success: true,
        sent: 0,
        message: 'Outside optimal send window (Mon–Fri 9am–2pm AEST). Campaign activated — emails will be sent at the next optimal window by the follow-up cron.',
      })
    }

    const clientData = campaign.clients as {
      name: string
      email: string
      business_name: string | null
      business_address: string | null
    } | null
    const clientEmail = clientData?.email ?? ''
    // Use client's business details for email footer — fall back to env vars if not set
    const clientBusinessName = clientData?.business_name ?? clientData?.name ?? undefined
    const clientBusinessAddress = clientData?.business_address ?? undefined
    const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/$/, '')
    const channel = campaign.channel as 'email' | 'sms' | 'both'

    // 4. Count emails sent today (all campaigns) to enforce DAILY_SEND_LIMIT
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)

    const { count: sentToday } = await supabase
      .from('emails')
      .select('id', { count: 'exact', head: true })
      .gte('sent_at', todayStart.toISOString())

    const dailyLimit = parseInt(process.env.DAILY_SEND_LIMIT ?? '150', 10)
    const remainingToday = Math.max(0, dailyLimit - (sentToday ?? 0))

    if (remainingToday === 0) {
      return NextResponse.json(
        {
          error: `Daily send limit of ${dailyLimit} reached. Remaining sends will be processed tomorrow.`,
          sent: 0,
          queued: 0,
        },
        { status: 429 }
      )
    }

    // 5a. Fetch A/B test config for Email 1 (if any)
    const { data: abTest1 } = await supabase
      .from('campaign_ab_tests')
      .select('*')
      .eq('campaign_id', campaignId)
      .eq('sequence_number', 1)
      .eq('ab_test_enabled', true)
      .maybeSingle()

    // Local counters — updated after each send to avoid repeated DB round-trips
    let abASends = abTest1?.ab_variant_a_sends ?? 0
    let abBSends = abTest1?.ab_variant_b_sends ?? 0
    let abFirstSendAt: string | null = abTest1?.first_send_at ?? null

    // 5b. Fetch wave 1 pending leads for the initial send.
    // Wave 2 and wave 3 leads are sent by the follow-up cron on days 3-4 and 5-6.
    const { data: leads } = await supabase
      .from('leads')
      .select('id, name, email, phone, booking_token, send_failure_count, email_opt_out, sms_opt_out, status, rfm_wave')
      .eq('campaign_id', campaignId)
      .eq('status', 'pending')
      .eq('rfm_wave', 1)
      .not('status', 'in', '(deleted,unsubscribed)')

    // Count wave 2/3 leads that will be picked up by the follow-up cron
    const { count: deferredCount } = await supabase
      .from('leads')
      .select('id', { count: 'exact', head: true })
      .eq('campaign_id', campaignId)
      .eq('status', 'pending')
      .in('rfm_wave', [2, 3])

    const activatedAt = new Date().toISOString()

    if (!leads || leads.length === 0) {
      await supabase.from('campaigns').update({ status: 'active', activated_at: activatedAt }).eq('id', campaignId)
      const deferred = deferredCount ?? 0
      return NextResponse.json({
        message: deferred > 0
          ? `No wave 1 leads — ${deferred} lead${deferred !== 1 ? 's' : ''} deferred to follow-up cron (wave 2/3)`
          : 'No pending leads — campaign set to active',
        sent: 0,
        queued: deferred,
      })
    }

    // 6. Respect daily limit — process up to remainingToday leads
    const maxSendRetries = parseInt(process.env.MAX_SEND_RETRIES ?? '3', 10)
    const leadsToSend = leads.slice(0, remainingToday)
    const leadsQueued = leads.length - leadsToSend.length

    let sentCount = 0
    let failedCount = 0

    // 7. Send Email 1 to each eligible lead
    for (const lead of leadsToSend) {
      // ===== CAMPAIGN SAFETY CHECKS (AI_rules.md) =====
      // Check 1: Fetch fresh campaign status — could have been paused mid-send
      const { data: freshCampaign } = await supabase
        .from('campaigns')
        .select('status')
        .eq('id', campaignId)
        .single()

      if (freshCampaign?.status === 'paused') {
        console.log(`[send] Campaign ${campaignId} was paused mid-send — stopping`)
        break
      }

      // Check 2: lead.email_opt_out must be false
      if (lead.email_opt_out) {
        console.log(`[send] Skipping lead ${lead.id} — opted out`)
        continue
      }

      // Check 3: lead status must not be deleted or unsubscribed
      if (lead.status === 'deleted' || lead.status === 'unsubscribed') {
        continue
      }

      // Check 4: send_failure_count < MAX_SEND_RETRIES
      if (lead.send_failure_count >= maxSendRetries) {
        continue
      }

      const hasEmail = channel === 'email' || channel === 'both'
      const hasSms = channel === 'sms' || channel === 'both'

      // Check 5: lead must have required contact details for the channel
      if (hasEmail && !lead.email) continue
      if (hasSms && !lead.phone) continue
      // Also check SMS opt-out for SMS-enabled campaigns
      if (hasSms && lead.sms_opt_out) continue

      const bookingUrl = `${appUrl}/book/${lead.booking_token}`
      const now = new Date().toISOString()

      try {
        let emailSent = false
        let smsSent = false

        // Send Email 1 (if channel includes email)
        if (hasEmail && lead.email) {
          const { data: email1 } = await supabase
            .from('emails')
            .select('id, subject, body')
            .eq('lead_id', lead.id)
            .eq('sequence_number', 1)
            .single()

          if (email1) {
            let subjectToSend = email1.subject
            let abVariant: string | null = null

            if (abTest1) {
              // Use declared winner if available; otherwise randomly assign
              const winner = abTest1.ab_winner as 'A' | 'B' | 'inconclusive' | null
              abVariant = (winner === 'A' || winner === 'B') ? winner : pickAbVariant()
              subjectToSend =
                abVariant === 'A'
                  ? (abTest1.subject_variant_a ?? email1.subject)
                  : (abTest1.subject_variant_b ?? email1.subject)
              if (!abFirstSendAt) abFirstSendAt = now
              if (abVariant === 'A') { abASends++ } else { abBSends++ }
              // Persist variant assignment and updated counts
              await Promise.all([
                supabase.from('emails').update({ ab_variant_assigned: abVariant }).eq('id', email1.id),
                supabase.from('campaign_ab_tests').update({
                  ab_variant_a_sends: abASends,
                  ab_variant_b_sends: abBSends,
                  first_send_at: abFirstSendAt,
                }).eq('id', abTest1.id),
              ])
            }

            await sendEmail({
              to: lead.email,
              subject: subjectToSend,
              body: email1.body,
              bookingUrl,
              replyTo: clientEmail,
              emailId: email1.id,
              leadToken: lead.booking_token,
              clientBusinessName,
              clientBusinessAddress,
            })
            await supabase.from('emails').update({ sent_at: now }).eq('id', email1.id)
            await supabase.from('lead_events').insert({
              lead_id: lead.id,
              event_type: 'email_sent',
              description: `Email 1 sent to ${lead.email}${abVariant ? ` (A/B variant ${abVariant})` : ''}`,
            })
            emailSent = true
          }
        }

        // Send SMS 1 (if channel includes SMS and Twilio is configured)
        // For channel='both': skip SMS 1 here — it will be deferred to follow-up cron 48hrs after Email 1 (if unopened)
        if (hasSms && !hasEmail && lead.phone && isTwilioConfigured()) {
          const { data: sms1 } = await supabase
            .from('sms_messages')
            .select('id, body')
            .eq('lead_id', lead.id)
            .eq('sequence_number', 1)
            .single()

          if (sms1) {
            await sendSms(lead.phone, sms1.body, bookingUrl)
            await supabase.from('sms_messages').update({ sent_at: now }).eq('id', sms1.id)
            await supabase.from('lead_events').insert({
              lead_id: lead.id,
              event_type: 'sms_sent',
              description: `SMS 1 sent to ${lead.phone}`,
            })
            smsSent = true
          }
        }

        // Update lead status based on what was sent
        if (emailSent || smsSent) {
          const newStatus = emailSent ? 'emailed' : 'sms_sent'
          await supabase.from('leads').update({ status: newStatus }).eq('id', lead.id)
          sentCount++
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        console.error(`[send] Failed to send Email 1 to lead ${lead.id}:`, message)

        // Log failure
        await supabase.from('send_failures').insert({
          lead_id: lead.id,
          campaign_id: campaignId,
          channel: 'email',
          sequence_number: 1,
          error_message: message,
          attempt_count: 1,
          resolved: false,
        })

        // Increment failure counter
        await supabase
          .from('leads')
          .update({ send_failure_count: lead.send_failure_count + 1 })
          .eq('id', lead.id)

        failedCount++
      }

      // Randomised delay between sends — required for Gmail deliverability
      // 30–60 seconds per AI_rules.md
      if (sentCount + failedCount < leadsToSend.length) {
        await sendDelay()
      }
    }

    // 8. Update campaign to "active" (even with partial sends)
    await supabase.from('campaigns').update({ status: 'active', activated_at: activatedAt }).eq('id', campaignId)

    return NextResponse.json({
      success: true,
      sent: sentCount,
      failed: failedCount,
      queued: leadsQueued,
      message:
        leadsQueued > 0
          ? `${sentCount} sent, ${leadsQueued} queued for tomorrow (daily limit).`
          : `${sentCount} sent successfully.`,
    })
  } catch (err) {
    console.error('[send] Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
