import { NextRequest, NextResponse } from 'next/server'
import { getAdminUserId } from '@/lib/auth'
import { getSupabaseClient } from '@/lib/supabase'
import { generateEmailSequence, generateSmsSequence } from '@/lib/claude'

// Vercel max execution time — set to 300s for large campaigns
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

    // 2. Fetch campaign
    const { data: campaign, error: campaignError } = await supabase
      .from('campaigns')
      .select('*, clients(name)')
      .eq('id', campaignId)
      .single()

    if (campaignError || !campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
    }

    if (campaign.status !== 'draft') {
      return NextResponse.json(
        { error: `Campaign is "${campaign.status}" — can only generate for draft campaigns` },
        { status: 400 }
      )
    }

    // 3. Fetch all leads for this campaign
    const { data: leads, error: leadsError } = await supabase
      .from('leads')
      .select('id, name, email, phone, last_contact_date, service_type, purchase_value, notes')
      .eq('campaign_id', campaignId)
      .not('status', 'in', '(deleted)')

    if (leadsError || !leads || leads.length === 0) {
      return NextResponse.json({ error: 'No leads found for this campaign' }, { status: 400 })
    }

    // Skip leads that already have Email 1 generated — allows safe re-run for newly added leads
    const { data: existingEmailLeads } = await supabase
      .from('emails')
      .select('lead_id')
      .in('lead_id', leads.map((l) => l.id))
      .eq('sequence_number', 1)

    const alreadyGeneratedIds = new Set((existingEmailLeads ?? []).map((e) => e.lead_id))
    const leadsToGenerate = leads.filter((l) => !alreadyGeneratedIds.has(l.id))

    if (leadsToGenerate.length === 0) {
      return NextResponse.json({
        success: true,
        generated: 0,
        failed: 0,
        status: campaign.status,
        message: 'All leads already have sequences generated.',
      })
    }

    // The client business name comes from the joined clients record
    const clientName =
      (campaign.clients as { name: string } | null)?.name ?? 'the business'

    const channel = campaign.channel as 'email' | 'sms' | 'both'
    const { tone_preset, tone_custom, custom_instructions } = campaign

    const failedLeads: string[] = []
    let generatedCount = 0

    // 4. Generate + insert sequences in parallel (up to 5 concurrent Claude calls).
    // Running sequentially was too slow for 8-email branched prompts (~25s each).
    const CONCURRENCY = 5
    async function processLead(lead: typeof leadsToGenerate[number]) {
      const emailInserts: object[] = []
      const smsInserts: object[] = []

      // Build lead context (enrichment fields only included if non-blank)
      const leadContext = {
        name: lead.name,
        last_contact_date: lead.last_contact_date ?? undefined,
        service_type: lead.service_type ?? undefined,
        purchase_value: lead.purchase_value ?? undefined,
        notes: lead.notes ?? undefined,
      }

      // Generate email sequence (8 variants: email1, email4 are single;
      // email2 and email3 each have 3 behaviour-based branch variants)
      if (channel === 'email' || channel === 'both') {
        const seq = await generateEmailSequence(
          leadContext,
          clientName,
          tone_preset,
          tone_custom,
          custom_instructions
        )
        const BRANCH_ROWS = [
          { sequence_number: 1, branch_variant: null,         data: seq.email1 },
          { sequence_number: 2, branch_variant: '2_unopened', data: seq.email2_unopened },
          { sequence_number: 2, branch_variant: '2_opened',   data: seq.email2_opened },
          { sequence_number: 2, branch_variant: '2_clicked',  data: seq.email2_clicked },
          { sequence_number: 3, branch_variant: '3_unopened', data: seq.email3_unopened },
          { sequence_number: 3, branch_variant: '3_opened',   data: seq.email3_opened },
          { sequence_number: 3, branch_variant: '3_clicked',  data: seq.email3_clicked },
          { sequence_number: 4, branch_variant: null,         data: seq.email4 },
        ] as const
        for (const row of BRANCH_ROWS) {
          emailInserts.push({
            lead_id: lead.id,
            sequence_number: row.sequence_number,
            branch_variant: row.branch_variant,
            subject: row.data.subject,
            body: row.data.body,
          })
        }
      }

      // Generate SMS sequence
      if (channel === 'sms' || channel === 'both') {
        const smsList = await generateSmsSequence(
          leadContext,
          clientName,
          tone_preset,
          tone_custom,
          custom_instructions
        )
        for (let i = 0; i < 4; i++) {
          smsInserts.push({
            lead_id: lead.id,
            sequence_number: i + 1,
            body: smsList[i].body,
          })
        }
      }

      // Insert emails
      if (emailInserts.length > 0) {
        const { error } = await supabase.from('emails').insert(emailInserts)
        if (error) throw new Error(`Email insert failed: ${error.message}`)
      }

      // Insert SMS
      if (smsInserts.length > 0) {
        const { error } = await supabase.from('sms_messages').insert(smsInserts)
        if (error) throw new Error(`SMS insert failed: ${error.message}`)
      }
    }

    // Process in batches of CONCURRENCY
    for (let i = 0; i < leadsToGenerate.length; i += CONCURRENCY) {
      const batch = leadsToGenerate.slice(i, i + CONCURRENCY)
      const results = await Promise.allSettled(batch.map((lead) => processLead(lead)))
      for (let j = 0; j < results.length; j++) {
        const result = results[j]
        if (result.status === 'fulfilled') {
          generatedCount++
        } else {
          const message = result.reason instanceof Error ? result.reason.message : String(result.reason)
          console.error(`[generate] Failed for lead ${batch[j].name}:`, message)
          failedLeads.push(batch[j].name)
        }
      }
    }

    // 5. Update campaign status to "ready" (even if some leads failed)
    if (generatedCount > 0) {
      const { error: updateError } = await supabase
        .from('campaigns')
        .update({ status: 'ready' })
        .eq('id', campaignId)

      if (updateError) {
        console.error('[generate] Failed to update campaign status:', updateError.message)
      }
    }

    return NextResponse.json({
      success: true,
      generated: generatedCount,
      failed: failedLeads.length,
      failed_leads: failedLeads,
      status: generatedCount > 0 ? 'ready' : 'draft',
    })
  } catch (err) {
    console.error('[generate] Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
