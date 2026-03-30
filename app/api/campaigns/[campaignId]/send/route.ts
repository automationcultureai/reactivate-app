import { NextRequest, NextResponse } from 'next/server'
import { getAdminUserId } from '@/lib/auth'
import { getSupabaseClient } from '@/lib/supabase'
import { sendEmail, sendDelay } from '@/lib/email'
import { sendSms, isTwilioConfigured } from '@/lib/twilio'
import { pickAbVariant } from '@/lib/ab-testing'
import { isEmailOptimalNow } from '@/lib/sydney-time'

// Each call processes up to `limit` leads then returns `remaining`.
// The client loops until remaining === 0, keeping each Vercel invocation short.
export const maxDuration = 300

export async function POST(
  req: NextRequest,
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

    // Per-call limit — client loops until remaining === 0
    const url = new URL(req.url)
    const limit = Math.min(Math.max(1, parseInt(url.searchParams.get('limit') ?? '5', 10)), 20)

    // 2. Fetch campaign + client
    const { data: campaign, error: campaignError } = await supabase
      .from('campaigns')
      .select('*, clients(name, email, business_name, business_address, logo_url, brand_color)')
      .eq('id', campaignId)
      .single()

    if (campaignError || !campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
    }

    // Allow 'ready' (first call) or 'active' (subsequent loop calls)
    if (campaign.status !== 'ready' && campaign.status !== 'active') {
      return NextResponse.json(
        { error: `Cannot send: campaign status is "${campaign.status}"` },
        { status: 400 }
      )
    }

    // 3. Time-of-day gate — only on first call (status=ready)
    if (campaign.status === 'ready' && !isEmailOptimalNow()) {
      const activatedAt = new Date().toISOString()
      await supabase.from('campaigns').update({ status: 'active', activated_at: activatedAt }).eq('id', campaignId)
      return NextResponse.json({
        success: true,
        sent: 0,
        remaining: 0,
        message: 'Outside optimal send window (Mon–Fri 9am–2pm AEST). Campaign activated — emails will be sent at the next optimal window by the follow-up cron.',
      })
    }

    const clientData = campaign.clients as {
      name: string
      email: string
      business_name: string | null
      business_address: string | null
      logo_url: string | null
      brand_color: string | null
    } | null
    const clientEmail = clientData?.email ?? ''
    const clientBusinessName = clientData?.business_name ?? clientData?.name ?? undefined
    const clientBusinessAddress = clientData?.business_address ?? undefined
    const clientLogoUrl = clientData?.logo_url ?? undefined
    const clientBrandColor = clientData?.brand_color ?? undefined
    const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/$/, '')
    const channel = campaign.channel as 'email' | 'sms' | 'both'

    // 4. Enforce daily send limit
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
        { error: `Daily send limit of ${dailyLimit} reached. Remaining sends will be processed tomorrow.`, sent: 0, remaining: 0 },
        { status: 429 }
      )
    }

    // 5a. Fetch A/B test config for Email 1
    const { data: abTest1 } = await supabase
      .from('campaign_ab_tests')
      .select('*')
      .eq('campaign_id', campaignId)
      .eq('sequence_number', 1)
      .eq('ab_test_enabled', true)
      .maybeSingle()

    let abASends = abTest1?.ab_variant_a_sends ?? 0
    let abBSends = abTest1?.ab_variant_b_sends ?? 0
    let abFirstSendAt: string | null = abTest1?.first_send_at ?? null

    // 5b. Count total pending wave 1 leads, fetch only `limit` for this call
    const { count: totalPending } = await supabase
      .from('leads')
      .select('id', { count: 'exact', head: true })
      .eq('campaign_id', campaignId)
      .eq('status', 'pending')
      .eq('rfm_wave', 1)

    const { data: leads } = await supabase
      .from('leads')
      .select('id, name, email, phone, booking_token, send_failure_count, email_opt_out, sms_opt_out, status, rfm_wave')
      .eq('campaign_id', campaignId)
      .eq('status', 'pending')
      .eq('rfm_wave', 1)
      .not('status', 'in', '(deleted,unsubscribed)')
      .limit(Math.min(limit, remainingToday))

    // Count wave 2/3 leads deferred to follow-up cron
    const { count: deferredCount } = await supabase
      .from('leads')
      .select('id', { count: 'exact', head: true })
      .eq('campaign_id', campaignId)
      .eq('status', 'pending')
      .in('rfm_wave', [2, 3])

    // Activate campaign on first call
    const activatedAt = new Date().toISOString()
    if (campaign.status === 'ready') {
      await supabase.from('campaigns').update({ status: 'active', activated_at: activatedAt }).eq('id', campaignId)
    }

    if (!leads || leads.length === 0) {
      const deferred = deferredCount ?? 0
      return NextResponse.json({
        success: true,
        sent: 0,
        failed: 0,
        remaining: 0,
        message: deferred > 0
          ? `No wave 1 leads — ${deferred} lead${deferred !== 1 ? 's' : ''} deferred to follow-up cron (wave 2/3)`
          : 'No pending leads — campaign set to active',
      })
    }

    const maxSendRetries = parseInt(process.env.MAX_SEND_RETRIES ?? '3', 10)
    let sentCount = 0
    let failedCount = 0

    // 6. Send to this batch
    for (const lead of leads) {
      // Safety check: fetch fresh campaign status in case it was paused
      const { data: freshCampaign } = await supabase
        .from('campaigns')
        .select('status')
        .eq('id', campaignId)
        .single()

      if (freshCampaign?.status === 'paused') {
        console.log(`[send] Campaign ${campaignId} was paused mid-send — stopping`)
        break
      }

      if (lead.email_opt_out) continue
      if (lead.status === 'deleted' || lead.status === 'unsubscribed') continue
      if (lead.send_failure_count >= maxSendRetries) continue

      const hasEmail = channel === 'email' || channel === 'both'
      const hasSms = channel === 'sms' || channel === 'both'

      if (hasEmail && !lead.email) continue
      if (hasSms && !lead.phone) continue
      if (hasSms && lead.sms_opt_out) continue

      const bookingUrl = `${appUrl}/book/${lead.booking_token}`
      const now = new Date().toISOString()

      try {
        let emailSent = false
        let smsSent = false

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
              const winner = abTest1.ab_winner as 'A' | 'B' | 'inconclusive' | null
              abVariant = (winner === 'A' || winner === 'B') ? winner : pickAbVariant()
              subjectToSend =
                abVariant === 'A'
                  ? (abTest1.subject_variant_a ?? email1.subject)
                  : (abTest1.subject_variant_b ?? email1.subject)
              if (!abFirstSendAt) abFirstSendAt = now
              if (abVariant === 'A') { abASends++ } else { abBSends++ }
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
              clientLogoUrl,
              clientBrandColor,
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

        if (emailSent || smsSent) {
          const newStatus = emailSent ? 'emailed' : 'sms_sent'
          await supabase.from('leads').update({ status: newStatus }).eq('id', lead.id)
          sentCount++
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        console.error(`[send] Failed to send Email 1 to lead ${lead.id}:`, message)

        await supabase.from('send_failures').insert({
          lead_id: lead.id,
          campaign_id: campaignId,
          channel: 'email',
          sequence_number: 1,
          error_message: message,
          attempt_count: 1,
          resolved: false,
        })

        await supabase
          .from('leads')
          .update({ send_failure_count: lead.send_failure_count + 1 })
          .eq('id', lead.id)

        failedCount++
      }

      if (sentCount + failedCount < leads.length) {
        await sendDelay()
      }
    }

    // remaining = total pending wave 1 minus the batch we just processed
    const remaining = Math.max(0, (totalPending ?? 0) - leads.length)

    return NextResponse.json({
      success: true,
      sent: sentCount,
      failed: failedCount,
      remaining,
    })
  } catch (err) {
    console.error('[send] Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
