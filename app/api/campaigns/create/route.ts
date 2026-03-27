import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAdminUserId } from '@/lib/auth'
import { getSupabaseClient } from '@/lib/supabase'
import { scoreAndWaveLeads } from '@/lib/rfm'

const leadSchema = z.object({
  name: z.string().min(1).max(200),
  email: z.string().email().optional(),
  phone: z.string().min(7).max(20).optional(),
  // Optional enrichment columns — accepted if present, never required
  last_contact_date: z.string().max(100).optional().nullable(),
  service_type: z.string().max(200).optional().nullable(),
  purchase_value: z.string().max(100).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  // RFM scoring inputs — optional, used for wave prioritisation
  last_purchase_date: z.string().max(100).optional().nullable(),
  purchase_count: z.string().max(50).optional().nullable(),
  lifetime_value: z.string().max(50).optional().nullable(),
})

const createCampaignSchema = z.object({
  client_id: z.string().uuid(),
  name: z.string().min(1, 'Campaign name is required').max(200),
  channel: z.enum(['email', 'sms', 'both']),
  tone_preset: z.enum(['professional', 'friendly', 'casual', 'empathetic', 'direct', 'authoritative', 'playful', 'sincere', 'nostalgic', 'consultative']),
  tone_custom: z.string().max(500).nullable().optional(),
  custom_instructions: z.string().max(2000).nullable().optional(),
  consent_basis: z.enum([
    'Previous customer',
    'Quote/enquiry requested',
    'Service subscriber',
    'Other',
  ]),
  template_id: z.string().uuid().nullable().optional(),
  notify_client: z.boolean().default(true),
  send_booking_confirmation: z.boolean().default(true),
  send_booking_reminder: z.boolean().default(true),
  leads: z.array(leadSchema).min(1, 'At least 1 lead is required').max(1000),
  confirm_duplicates: z.boolean().default(false),
})

export async function POST(req: NextRequest) {
  try {
    // 1. Admin auth
    const adminUserId = await getAdminUserId()
    if (!adminUserId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // 2. Validate input
    const body = await req.json()
    const parsed = createCampaignSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid input' },
        { status: 400 }
      )
    }

    const {
      client_id,
      name,
      channel,
      tone_preset,
      tone_custom,
      custom_instructions,
      consent_basis,
      template_id,
      notify_client,
      send_booking_confirmation,
      send_booking_reminder,
      leads,
      confirm_duplicates,
    } = parsed.data

    const supabase = getSupabaseClient()

    // 3. Verify client exists and belongs to our system
    const { data: client, error: clientError } = await supabase
      .from('clients')
      .select('id')
      .eq('id', client_id)
      .single()

    if (clientError || !client) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 })
    }

    // 4. Duplicate detection — check emails/phones against active campaigns for same client
    if (!confirm_duplicates) {
      const emails = leads.map((l) => l.email).filter(Boolean) as string[]
      const phones = leads.map((l) => l.phone).filter(Boolean) as string[]

      // Get active campaign IDs for this client
      const { data: activeCampaigns } = await supabase
        .from('campaigns')
        .select('id')
        .eq('client_id', client_id)
        .in('status', ['draft', 'ready', 'active', 'paused'])

      const activeCampaignIds = (activeCampaigns ?? []).map((c) => c.id)

      let duplicateCount = 0

      if (activeCampaignIds.length > 0) {
        if (emails.length > 0) {
          const { count } = await supabase
            .from('leads')
            .select('id', { count: 'exact', head: true })
            .in('campaign_id', activeCampaignIds)
            .in('email', emails)
            .not('status', 'in', '(deleted,unsubscribed)')
          duplicateCount += count ?? 0
        }

        if (phones.length > 0) {
          const { count } = await supabase
            .from('leads')
            .select('id', { count: 'exact', head: true })
            .in('campaign_id', activeCampaignIds)
            .in('phone', phones)
            .not('status', 'in', '(deleted,unsubscribed)')
          duplicateCount += count ?? 0
        }
      }

      if (duplicateCount > 0) {
        return NextResponse.json(
          {
            requires_confirmation: true,
            duplicate_count: duplicateCount,
            message: `${duplicateCount} lead${duplicateCount !== 1 ? 's' : ''} already exist in active campaigns for this client.`,
          },
          { status: 200 }
        )
      }
    }

    // 5. Create campaign (status: draft)
    const { data: campaign, error: campaignError } = await supabase
      .from('campaigns')
      .insert({
        client_id,
        name,
        status: 'draft',
        channel,
        tone_preset,
        tone_custom: tone_custom ?? null,
        custom_instructions: custom_instructions ?? null,
        consent_basis,
        template_id: template_id ?? null,
        notify_client,
        send_booking_confirmation,
        send_booking_reminder,
      })
      .select()
      .single()

    if (campaignError || !campaign) {
      console.error('[campaigns/create] Failed to create campaign:', campaignError?.message)
      return NextResponse.json({ error: 'Failed to create campaign' }, { status: 500 })
    }

    // 6. Bulk insert leads (booking_token generated by DB default)
    const leadRows = leads.map((lead) => ({
      campaign_id: campaign.id,
      client_id,
      name: lead.name,
      email: lead.email ?? null,
      phone: lead.phone ?? null,
      status: 'pending' as const,
      last_contact_date: lead.last_contact_date ?? null,
      service_type: lead.service_type ?? null,
      purchase_value: lead.purchase_value ?? null,
      notes: lead.notes ?? null,
      // RFM inputs — stored as-is from CSV; scorer converts and sets rfm_* columns
      last_purchase_date: lead.last_purchase_date ?? null,
      purchase_count: lead.purchase_count ? (parseInt(lead.purchase_count, 10) || null) : null,
      lifetime_value: lead.lifetime_value ? (parseFloat(lead.lifetime_value) || null) : null,
    }))

    const { error: leadsError } = await supabase.from('leads').insert(leadRows)

    if (leadsError) {
      console.error('[campaigns/create] Failed to insert leads:', leadsError.message)
      // Rollback campaign
      await supabase.from('campaigns').delete().eq('id', campaign.id)
      return NextResponse.json({ error: 'Failed to insert leads' }, { status: 500 })
    }

    // 7. Score leads and assign waves (non-fatal if it fails — leads default to wave 1)
    try {
      await scoreAndWaveLeads(campaign.id)
    } catch (rfmErr) {
      console.error('[campaigns/create] RFM scoring failed (non-fatal):', rfmErr)
    }

    return NextResponse.json(
      {
        campaign_id: campaign.id,
        lead_count: leads.length,
        requires_confirmation: false,
      },
      { status: 201 }
    )
  } catch (err) {
    console.error('[campaigns/create] Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
