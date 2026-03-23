import { NextRequest, NextResponse } from 'next/server'
import { getAdminUserId } from '@/lib/auth'
import { getSupabaseClient } from '@/lib/supabase'
import { generateEmailSequence, generateSmsSequence } from '@/lib/claude'

// Each call processes up to `limit` leads (default 10) then returns `remaining`.
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
    const limit = Math.min(Math.max(1, parseInt(url.searchParams.get('limit') ?? '10', 10)), 50)

    // 2. Fetch campaign
    const { data: campaign, error: campaignError } = await supabase
      .from('campaigns')
      .select('*, clients(name)')
      .eq('id', campaignId)
      .single()

    if (campaignError || !campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
    }

    // Allow draft and ready — ready campaigns may have newly added leads to generate for
    if (campaign.status !== 'draft' && campaign.status !== 'ready') {
      return NextResponse.json(
        { error: `Campaign is "${campaign.status}" — can only generate for draft or ready campaigns` },
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

    // Skip leads that already have Email 1 generated — idempotent across calls
    const { data: existingEmailLeads } = await supabase
      .from('emails')
      .select('lead_id')
      .in('lead_id', leads.map((l) => l.id))
      .eq('sequence_number', 1)
      .is('branch_variant', null)

    const alreadyGeneratedIds = new Set((existingEmailLeads ?? []).map((e) => e.lead_id))
    const leadsToGenerate = leads.filter((l) => !alreadyGeneratedIds.has(l.id))

    if (leadsToGenerate.length === 0) {
      return NextResponse.json({
        success: true,
        generated: 0,
        failed: 0,
        remaining: 0,
        total: leads.length,
        status: campaign.status,
        message: 'All leads already have sequences generated.',
      })
    }

    // This call processes up to `limit` leads; the rest remain for the next call
    const batch = leadsToGenerate.slice(0, limit)
    const remaining = leadsToGenerate.length - batch.length

    const clientName =
      (campaign.clients as { name: string } | null)?.name ?? 'the business'

    const channel = campaign.channel as 'email' | 'sms' | 'both'
    const { tone_preset, tone_custom, custom_instructions } = campaign

    const failedLeads: string[] = []
    let generatedCount = 0

    // 4. Generate sequences in parallel (up to 5 concurrent Claude calls per batch)
    const CONCURRENCY = 5
    async function processLead(lead: typeof leadsToGenerate[number]) {
      const emailInserts: object[] = []
      const smsInserts: object[] = []

      const leadContext = {
        name: lead.name,
        last_contact_date: lead.last_contact_date ?? undefined,
        service_type: lead.service_type ?? undefined,
        purchase_value: lead.purchase_value ?? undefined,
        notes: lead.notes ?? undefined,
      }

      let emailSeq: Awaited<ReturnType<typeof generateEmailSequence>> | undefined

      if (channel === 'email' || channel === 'both') {
        const seq = await generateEmailSequence(
          leadContext,
          clientName,
          tone_preset,
          tone_custom,
          custom_instructions
        )
        emailSeq = seq
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

      if (channel === 'sms' || channel === 'both') {
        const smsList = await generateSmsSequence(
          leadContext,
          clientName,
          tone_preset,
          tone_custom,
          custom_instructions,
          emailSeq
        )
        for (let i = 0; i < 4; i++) {
          smsInserts.push({
            lead_id: lead.id,
            sequence_number: i + 1,
            body: smsList[i].body,
          })
        }
      }

      if (emailInserts.length > 0) {
        const { error } = await supabase.from('emails').insert(emailInserts)
        if (error) throw new Error(`Email insert failed: ${error.message}`)
      }

      if (smsInserts.length > 0) {
        const { error } = await supabase.from('sms_messages').insert(smsInserts)
        if (error) throw new Error(`SMS insert failed: ${error.message}`)
      }
    }

    for (let i = 0; i < batch.length; i += CONCURRENCY) {
      const chunk = batch.slice(i, i + CONCURRENCY)
      const results = await Promise.allSettled(chunk.map((lead) => processLead(lead)))
      for (let j = 0; j < results.length; j++) {
        const result = results[j]
        if (result.status === 'fulfilled') {
          generatedCount++
        } else {
          const message = result.reason instanceof Error ? result.reason.message : String(result.reason)
          console.error(`[generate] Failed for lead ${chunk[j].name}:`, message)
          failedLeads.push(chunk[j].name)
        }
      }
    }

    // 5. Mark campaign ready only when all leads are done
    if (generatedCount > 0 && remaining === 0 && campaign.status === 'draft') {
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
      remaining,
      total: leads.length,
      status: remaining === 0 && generatedCount > 0 ? 'ready' : campaign.status,
    })
  } catch (err) {
    console.error('[generate] Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
