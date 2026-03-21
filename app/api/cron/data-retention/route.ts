import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseClient } from '@/lib/supabase'
import { Resend } from 'resend'

export const maxDuration = 300

function verifyCronSecret(req: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) return false
  return req.headers.get('authorization') === `Bearer ${cronSecret}`
}

/**
 * Sends a plain notification email to the agency admin.
 * Uses the same Gmail credentials as the campaign mailer.
 * Non-fatal — if email fails, the anonymisation still succeeded.
 */
async function sendAdminNotification(count: number, skipped: number): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.RESEND_FROM_EMAIL
  const adminEmail = process.env.ADMIN_NOTIFICATION_EMAIL
  if (!apiKey || !from || !adminEmail) return

  const resend = new Resend(apiKey)
  const agencyName = process.env.AGENCY_NAME || 'Reactivate Agency'
  const retentionMonths = process.env.DATA_RETENTION_MONTHS || '12'

  await resend.emails.send({
    from,
    to: adminEmail,
    subject: `[${agencyName}] Monthly data retention — ${count} records anonymised`,
    text: [
      `Monthly data retention cron completed.`,
      ``,
      `Records anonymised: ${count}`,
      `Records skipped (already anonymised): ${skipped}`,
      `Retention policy: ${retentionMonths} months after campaign completion`,
      ``,
      `Bookings and commission records have been retained for billing purposes.`,
      `Lead event audit logs have been retained.`,
      ``,
      `This is an automated notification from the Reactivate platform.`,
    ].join('\n'),
  })
}

export async function POST(req: NextRequest) {
  if (!verifyCronSecret(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = getSupabaseClient()
  const retentionMonths = parseInt(process.env.DATA_RETENTION_MONTHS ?? '12', 10)

  // Calculate the cutoff date: campaigns created before this date qualify
  const cutoff = new Date()
  cutoff.setMonth(cutoff.getMonth() - retentionMonths)

  // Find campaigns that are "complete" and old enough for data retention
  const { data: eligibleCampaigns, error: campaignError } = await supabase
    .from('campaigns')
    .select('id, name')
    .eq('status', 'complete')
    .lt('created_at', cutoff.toISOString())

  if (campaignError) {
    console.error('[cron/data-retention] Failed to fetch campaigns:', campaignError.message)
    return NextResponse.json({ error: 'Failed to fetch campaigns' }, { status: 500 })
  }

  if (!eligibleCampaigns || eligibleCampaigns.length === 0) {
    return NextResponse.json({
      message: 'No campaigns eligible for data retention this month',
      anonymised: 0,
      skipped: 0,
    })
  }

  const campaignIds = eligibleCampaigns.map((c) => c.id)

  // Fetch leads that haven't already been anonymised
  const { data: leads, error: leadsError } = await supabase
    .from('leads')
    .select('id, name, email, status')
    .in('campaign_id', campaignIds)
    .not('status', 'eq', 'deleted')
    .not('email', 'eq', 'deleted@deleted.com')  // Skip already anonymised

  if (leadsError) {
    console.error('[cron/data-retention] Failed to fetch leads:', leadsError.message)
    return NextResponse.json({ error: 'Failed to fetch leads' }, { status: 500 })
  }

  const { count: alreadyDone } = await supabase
    .from('leads')
    .select('id', { count: 'exact', head: true })
    .in('campaign_id', campaignIds)
    .eq('email', 'deleted@deleted.com')

  const skippedCount = alreadyDone ?? 0

  if (!leads || leads.length === 0) {
    await sendAdminNotification(0, skippedCount).catch(console.error)
    return NextResponse.json({
      message: 'All eligible leads already anonymised',
      anonymised: 0,
      skipped: skippedCount,
    })
  }

  // Anonymise in batches of 100 to avoid payload limits
  const batchSize = 100
  let anonymisedCount = 0

  for (let i = 0; i < leads.length; i += batchSize) {
    const batch = leads.slice(i, i + batchSize)
    const batchIds = batch.map((l) => l.id)

    const { error: updateError } = await supabase
      .from('leads')
      .update({
        name: 'Deleted User',
        email: 'deleted@deleted.com',
        phone: null,
        status: 'deleted',
      })
      .in('id', batchIds)

    if (updateError) {
      console.error(
        `[cron/data-retention] Batch update failed (batch ${i / batchSize + 1}):`,
        updateError.message
      )
      // Continue with remaining batches
      continue
    }

    // Insert data_erased events for this batch
    const events = batchIds.map((leadId) => ({
      lead_id: leadId,
      event_type: 'data_erased',
      description: `Personal data automatically anonymised by monthly data retention policy (${retentionMonths} months)`,
    }))

    await supabase.from('lead_events').insert(events)
    anonymisedCount += batchIds.length
  }

  // Send admin notification email
  try {
    await sendAdminNotification(anonymisedCount, skippedCount)
  } catch (err) {
    console.error('[cron/data-retention] Admin notification failed:', err)
    // Non-fatal — anonymisation succeeded
  }

  return NextResponse.json({
    success: true,
    anonymised: anonymisedCount,
    skipped: skippedCount,
    eligible_campaigns: eligibleCampaigns.length,
    message: `Data retention complete: ${anonymisedCount} records anonymised across ${eligibleCampaigns.length} campaigns`,
  })
}
