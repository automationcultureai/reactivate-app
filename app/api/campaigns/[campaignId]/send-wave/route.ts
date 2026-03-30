import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAdminUserId } from '@/lib/auth'
import { getSupabaseClient } from '@/lib/supabase'
import { sendEmail, sendDelay } from '@/lib/email'
import { sendSms, isTwilioConfigured } from '@/lib/twilio'

export const maxDuration = 300

const bodySchema = z.object({
  wave: z.union([z.literal(2), z.literal(3)]),
})

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ campaignId: string }> }
) {
  try {
    const adminUserId = await getAdminUserId()
    if (!adminUserId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { campaignId } = await params
    const body = await req.json()
    const parsed = bodySchema.safeParse(body)
    if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })

    const { wave } = parsed.data
    const supabase = getSupabaseClient()

    // Fetch campaign + client
    const { data: campaign } = await supabase
      .from('campaigns')
      .select('*, clients(name, email, business_name, business_address, logo_url, brand_color, branding_enabled)')
      .eq('id', campaignId)
      .single()

    if (!campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })

    if (campaign.status !== 'active' && campaign.status !== 'paused') {
      return NextResponse.json(
        { error: `Campaign must be active or paused to send a wave (current: ${campaign.status})` },
        { status: 400 }
      )
    }

    const clientData = campaign.clients as {
      name: string; email: string
      business_name: string | null; business_address: string | null
      logo_url: string | null; brand_color: string | null; branding_enabled: boolean
    } | null
    const clientEmail = clientData?.email ?? ''
    const clientBusinessName = clientData?.business_name ?? clientData?.name ?? undefined
    const clientBusinessAddress = clientData?.business_address ?? undefined
    const brandingOn = clientData?.branding_enabled !== false
    const clientLogoUrl = brandingOn ? (clientData?.logo_url ?? undefined) : undefined
    const clientBrandColor = brandingOn ? (clientData?.brand_color ?? undefined) : undefined
    const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/$/, '')
    const channel = campaign.channel as 'email' | 'sms' | 'both'

    // Enforce daily limit
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
        { error: `Daily send limit of ${dailyLimit} reached. Try again tomorrow.`, sent: 0 },
        { status: 429 }
      )
    }

    // Fetch pending leads in the specified wave
    const { data: leads } = await supabase
      .from('leads')
      .select('id, name, email, phone, booking_token, send_failure_count, email_opt_out, sms_opt_out, status, rfm_wave')
      .eq('campaign_id', campaignId)
      .eq('status', 'pending')
      .eq('rfm_wave', wave)

    if (!leads || leads.length === 0) {
      return NextResponse.json({ message: `No pending leads in wave ${wave}`, sent: 0 })
    }

    const maxSendRetries = parseInt(process.env.MAX_SEND_RETRIES ?? '3', 10)
    const leadsToSend = leads.slice(0, remainingToday)
    const hasEmail = channel === 'email' || channel === 'both'
    const hasSms = channel === 'sms' || channel === 'both'

    let sentCount = 0
    let failedCount = 0

    for (const lead of leadsToSend) {
      // Safety checks
      const { data: freshCampaign } = await supabase
        .from('campaigns').select('status').eq('id', campaignId).single()
      if (freshCampaign?.status === 'paused') break

      if (lead.email_opt_out) continue
      if (lead.status === 'deleted' || lead.status === 'unsubscribed') continue
      if (lead.send_failure_count >= maxSendRetries) continue
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
            await sendEmail({
              to: lead.email,
              subject: email1.subject,
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
              description: `Email 1 sent to ${lead.email} (wave ${wave} manual send)`,
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
              description: `SMS 1 sent to ${lead.phone} (wave ${wave} manual send)`,
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
        console.error(`[send-wave] Failed for lead ${lead.id}:`, message)
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

      if (sentCount + failedCount < leadsToSend.length) {
        await sendDelay()
      }
    }

    return NextResponse.json({
      success: true,
      sent: sentCount,
      failed: failedCount,
      message: `${sentCount} wave ${wave} lead${sentCount !== 1 ? 's' : ''} sent.`,
    })
  } catch (err) {
    console.error('[send-wave] Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
