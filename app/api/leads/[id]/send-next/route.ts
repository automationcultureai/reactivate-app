import { NextRequest, NextResponse } from 'next/server'
import { getAdminUserId } from '@/lib/auth'
import { getSupabaseClient } from '@/lib/supabase'
import { sendEmail } from '@/lib/email'
import { sendSms, isTwilioConfigured } from '@/lib/twilio'

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

    const hasEmail = campaign.channel === 'email' || campaign.channel === 'both'
    const hasSms = campaign.channel === 'sms' || campaign.channel === 'both'

    // Channel-specific safety checks
    if (hasEmail) {
      if (lead.email_opt_out) {
        return NextResponse.json({ error: 'Lead has opted out of email' }, { status: 400 })
      }
      if (!lead.email) {
        return NextResponse.json({ error: 'Lead has no email address' }, { status: 400 })
      }
    }
    if (hasSms) {
      if (lead.sms_opt_out) {
        return NextResponse.json({ error: 'Lead has opted out of SMS' }, { status: 400 })
      }
      if (!lead.phone) {
        return NextResponse.json({ error: 'Lead has no phone number' }, { status: 400 })
      }
    }

    const clientData = campaign.clients
    const clientEmail = clientData?.email ?? ''
    const clientBusinessName = clientData?.business_name ?? clientData?.name ?? undefined
    const clientBusinessAddress = clientData?.business_address ?? undefined
    const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/$/, '')
    const bookingUrl = `${appUrl}/book/${lead.booking_token}`
    const now = new Date().toISOString()

    let emailSeqSent: number | undefined
    let smsSeqSent: number | undefined

    // ── Email ──────────────────────────────────────────────────────────────
    if (hasEmail) {
      // Fetch all emails for this lead to determine correct next step
      const { data: allEmails, error: emailsError } = await supabase
        .from('emails')
        .select('id, sequence_number, branch_variant, subject, body, sent_at, opened_at')
        .eq('lead_id', leadId)

      if (emailsError) {
        console.error('[leads/send-next] Failed to fetch emails:', emailsError.message)
        return NextResponse.json({ error: 'Failed to fetch email sequence' }, { status: 500 })
      }

      if (!allEmails || allEmails.length === 0) {
        return NextResponse.json({ error: 'No email sequence generated for this lead' }, { status: 400 })
      }

      // Find which sequence numbers are already "done" (at least one email row has sent_at)
      const sentSeqNums = new Set(
        allEmails.filter((e) => e.sent_at).map((e) => e.sequence_number)
      )

      // Next sequence number = first of [1,2,3,4] not yet sent
      const nextSeqNum = ([1, 2, 3, 4] as const).find((seq) => !sentSeqNums.has(seq))

      if (nextSeqNum === undefined) {
        return NextResponse.json({ error: 'No unsent emails remaining in sequence' }, { status: 400 })
      }

      let nextEmail: typeof allEmails[number] | undefined

      if (nextSeqNum === 1 || nextSeqNum === 4) {
        // No branching — fetch the canonical (no variant) row
        nextEmail = allEmails.find(
          (e) => e.sequence_number === nextSeqNum && e.branch_variant === null && !e.sent_at
        )
      } else {
        // Seq 2 or 3 — pick the right variant based on lead behaviour
        const hasClicked = ['clicked', 'booked', 'completed'].includes(lead.status)
        const hasOpened = hasClicked || allEmails.some((e) => e.opened_at)
        const variantSuffix = hasClicked ? 'clicked' : hasOpened ? 'opened' : 'unopened'
        const targetVariant = `${nextSeqNum}_${variantSuffix}`

        nextEmail = allEmails.find(
          (e) => e.sequence_number === nextSeqNum && e.branch_variant === targetVariant && !e.sent_at
        )
      }

      if (!nextEmail) {
        return NextResponse.json({ error: 'Could not find the next email to send' }, { status: 400 })
      }

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

      await supabase.from('emails').update({ sent_at: now }).eq('id', nextEmail.id)
      await supabase.from('lead_events').insert({
        lead_id: leadId,
        event_type: 'email_sent',
        description: `Email ${nextEmail.sequence_number} sent manually by admin to ${lead.email}`,
      })

      if (lead.status === 'pending') {
        await supabase.from('leads').update({ status: 'emailed' }).eq('id', leadId)
      }

      emailSeqSent = nextEmail.sequence_number
    }

    // ── SMS ────────────────────────────────────────────────────────────────
    if (hasSms) {
      if (!isTwilioConfigured()) {
        // For SMS-only channel this is fatal; for 'both' email already sent so skip gracefully
        if (!hasEmail) {
          return NextResponse.json({ error: 'Twilio is not configured' }, { status: 500 })
        }
      } else {
        try {
          const { data: smsMessages, error: smsError } = await supabase
            .from('sms_messages')
            .select('id, sequence_number, body, sent_at')
            .eq('lead_id', leadId)
            .is('sent_at', null)
            .order('sequence_number', { ascending: true })
            .limit(1)

          if (smsError) {
            if (!hasEmail) return NextResponse.json({ error: 'Failed to fetch SMS sequence' }, { status: 500 })
            console.error('[leads/send-next] Failed to fetch SMS:', smsError.message)
          } else if (!smsMessages || smsMessages.length === 0) {
            // For SMS-only this is an error; for 'both' email already sent so skip gracefully
            if (!hasEmail) {
              return NextResponse.json({ error: 'No unsent SMS remaining in sequence' }, { status: 400 })
            }
          } else {
            const nextSms = smsMessages[0]

            await sendSms(lead.phone, nextSms.body, bookingUrl)
            await supabase.from('sms_messages').update({ sent_at: now }).eq('id', nextSms.id)
            await supabase.from('lead_events').insert({
              lead_id: leadId,
              event_type: 'sms_sent',
              description: `SMS ${nextSms.sequence_number} sent manually by admin to ${lead.phone}`,
            })

            // Update pending SMS-only leads to sms_sent so follow-up sequence picks them up
            if (!hasEmail && lead.status === 'pending') {
              await supabase.from('leads').update({ status: 'sms_sent' }).eq('id', leadId)
            }

            smsSeqSent = nextSms.sequence_number
          }
        } catch (smsErr) {
          if (!hasEmail) throw smsErr // SMS-only: propagate → 500
          const msg = smsErr instanceof Error ? smsErr.message : String(smsErr)
          console.error('[leads/send-next] SMS failed (email already sent, continuing):', msg)
          return NextResponse.json({
            success: true,
            ...(emailSeqSent !== undefined && { sequence_number: emailSeqSent }),
            sms_error: msg,
          })
        }
      }
    }

    return NextResponse.json({
      success: true,
      ...(emailSeqSent !== undefined && { sequence_number: emailSeqSent }),
      ...(smsSeqSent !== undefined && { sms_sequence_number: smsSeqSent }),
    })
  } catch (err) {
    console.error('[leads/send-next] Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
