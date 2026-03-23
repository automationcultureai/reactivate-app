import { NextRequest, NextResponse } from 'next/server'
import { verifyWebhookSignature } from '@/lib/twilio'
import { getSupabaseClient } from '@/lib/supabase'

const STOP_KEYWORDS = ['stop', 'stopall', 'unsubscribe', 'cancel', 'end', 'quit']

export async function POST(req: NextRequest) {
  try {
    // 1. Parse the form-encoded body Twilio sends
    const formData = await req.formData()
    const params: Record<string, string> = {}
    formData.forEach((value, key) => {
      params[key] = String(value)
    })

    // 2. Verify Twilio signature — reject if invalid
    const signature = req.headers.get('x-twilio-signature') ?? ''
    const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/$/, '')
    const webhookUrl = `${appUrl}/api/webhooks/twilio`

    if (!verifyWebhookSignature(signature, webhookUrl, params)) {
      console.error('[webhooks/twilio] Invalid Twilio signature')
      return new NextResponse('Forbidden', { status: 403 })
    }

    const from = params['From'] ?? ''    // Lead's phone number
    const body = (params['Body'] ?? '').trim().toLowerCase()

    // 3. Check if this is a STOP/opt-out message
    const isStopRequest = STOP_KEYWORDS.some(
      (kw) => body === kw || body.startsWith(kw + ' ')
    )

    if (!isStopRequest) {
      // Not a stop message — return 200 (Twilio expects 200 for all webhooks)
      return new NextResponse('<?xml version="1.0"?><Response></Response>', {
        status: 200,
        headers: { 'Content-Type': 'text/xml' },
      })
    }

    // 4. Opt out ALL leads with this phone number across all campaigns
    const supabase = getSupabaseClient()

    const { data: leads } = await supabase
      .from('leads')
      .select('id')
      .eq('phone', from)
      .eq('sms_opt_out', false)  // Only update those not already opted out

    if (leads && leads.length > 0) {
      const leadIds = leads.map((l) => l.id)

      await supabase.from('leads').update({ sms_opt_out: true }).in('id', leadIds)

      // Log sms_opted_out event for each lead
      await supabase.from('lead_events').insert(
        leadIds.map((leadId) => ({
          lead_id: leadId,
          event_type: 'sms_opted_out',
          description: `Lead replied STOP via SMS (${from}). sms_opt_out set to true.`,
        }))
      )

      console.log(`[webhooks/twilio] Opted out ${leadIds.length} lead(s) for phone ${from}`)
    }

    // 5. Return empty TwiML response (Twilio requires a valid XML response)
    return new NextResponse('<?xml version="1.0"?><Response></Response>', {
      status: 200,
      headers: { 'Content-Type': 'text/xml' },
    })
  } catch (err) {
    console.error('[webhooks/twilio] Unexpected error:', err)
    // Always return 200 to prevent Twilio retries flooding the endpoint
    return new NextResponse('<?xml version="1.0"?><Response></Response>', {
      status: 200,
      headers: { 'Content-Type': 'text/xml' },
    })
  }
}
