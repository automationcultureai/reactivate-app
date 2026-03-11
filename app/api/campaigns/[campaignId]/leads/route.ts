import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAdminUserId } from '@/lib/auth'
import { getSupabaseClient } from '@/lib/supabase'

const parsedLeadSchema = z.object({
  name: z.string().min(1).max(200),
  email: z.string().email().optional(),
  phone: z.string().min(7).max(20).optional(),
  last_contact_date: z.string().max(100).optional().nullable(),
  service_type: z.string().max(200).optional().nullable(),
  purchase_value: z.string().max(100).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
})

const addLeadsSchema = z.object({
  leads: z.array(parsedLeadSchema).min(1).max(1000),
  confirm_duplicates: z.boolean().default(false),
})

const deleteLeadsSchema = z.object({
  lead_ids: z.array(z.string().uuid()).min(1).max(1000),
})

// POST — add leads to an existing campaign
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ campaignId: string }> }
) {
  try {
    const adminUserId = await getAdminUserId()
    if (!adminUserId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { campaignId } = await params
    const supabase = getSupabaseClient()

    // Verify campaign exists and is in an addable state
    const { data: campaign, error: campaignError } = await supabase
      .from('campaigns')
      .select('id, client_id, status, channel')
      .eq('id', campaignId)
      .single()

    if (campaignError || !campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
    }

    if (!['draft', 'ready', 'active', 'paused'].includes(campaign.status)) {
      return NextResponse.json(
        { error: `Cannot add leads to a "${campaign.status}" campaign` },
        { status: 400 }
      )
    }

    const body = await req.json()
    const parsed = addLeadsSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid input' },
        { status: 400 }
      )
    }

    const { leads, confirm_duplicates } = parsed.data

    // Duplicate check within this campaign
    if (!confirm_duplicates) {
      const emails = leads.map((l) => l.email).filter(Boolean) as string[]
      const phones = leads.map((l) => l.phone).filter(Boolean) as string[]

      let duplicateCount = 0

      if (emails.length > 0) {
        const { count } = await supabase
          .from('leads')
          .select('id', { count: 'exact', head: true })
          .eq('campaign_id', campaignId)
          .in('email', emails)
          .not('status', 'in', '(deleted,unsubscribed)')
        duplicateCount += count ?? 0
      }

      if (phones.length > 0) {
        const { count } = await supabase
          .from('leads')
          .select('id', { count: 'exact', head: true })
          .eq('campaign_id', campaignId)
          .in('phone', phones)
          .not('status', 'in', '(deleted,unsubscribed)')
        duplicateCount += count ?? 0
      }

      if (duplicateCount > 0) {
        return NextResponse.json(
          {
            requires_confirmation: true,
            duplicate_count: duplicateCount,
            message: `${duplicateCount} lead${duplicateCount !== 1 ? 's' : ''} already exist in this campaign.`,
          },
          { status: 200 }
        )
      }
    }

    // Insert new leads
    const leadRows = leads.map((lead) => ({
      campaign_id: campaignId,
      client_id: campaign.client_id,
      name: lead.name,
      email: lead.email ?? null,
      phone: lead.phone ?? null,
      status: 'pending' as const,
      last_contact_date: lead.last_contact_date ?? null,
      service_type: lead.service_type ?? null,
      purchase_value: lead.purchase_value ?? null,
      notes: lead.notes ?? null,
    }))

    const { error: insertError } = await supabase.from('leads').insert(leadRows)

    if (insertError) {
      console.error('[campaigns/leads/add] Insert failed:', insertError.message)
      return NextResponse.json({ error: 'Failed to insert leads' }, { status: 500 })
    }

    return NextResponse.json(
      { added: leads.length, duplicates: 0, requires_confirmation: false },
      { status: 201 }
    )
  } catch (err) {
    console.error('[campaigns/leads/add] Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE — bulk anonymise (GDPR erase) leads
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ campaignId: string }> }
) {
  try {
    const adminUserId = await getAdminUserId()
    if (!adminUserId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { campaignId } = await params

    const body = await req.json()
    const parsed = deleteLeadsSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid input' },
        { status: 400 }
      )
    }

    const { lead_ids } = parsed.data
    const supabase = getSupabaseClient()

    // Only operate on leads that belong to this campaign and aren't already deleted
    const { data: leads, error: fetchError } = await supabase
      .from('leads')
      .select('id, status')
      .eq('campaign_id', campaignId)
      .in('id', lead_ids)
      .not('status', 'eq', 'deleted')

    if (fetchError) {
      console.error('[campaigns/leads/delete] Fetch failed:', fetchError.message)
      return NextResponse.json({ error: 'Failed to fetch leads' }, { status: 500 })
    }

    if (!leads || leads.length === 0) {
      return NextResponse.json({ deleted: 0 })
    }

    const ids = leads.map((l) => l.id)

    // Anonymise
    const { error: updateError } = await supabase
      .from('leads')
      .update({
        name: 'Deleted User',
        email: 'deleted@deleted.com',
        phone: null,
        status: 'deleted',
      })
      .in('id', ids)

    if (updateError) {
      console.error('[campaigns/leads/delete] Anonymise failed:', updateError.message)
      return NextResponse.json({ error: 'Failed to erase leads' }, { status: 500 })
    }

    // Log erasure events for each lead
    const events = ids.map((leadId) => ({
      lead_id: leadId,
      event_type: 'data_erased' as const,
      description: 'Personal data erased by admin via bulk delete (right to erasure). Booking records retained for billing.',
    }))

    await supabase.from('lead_events').insert(events)

    return NextResponse.json({ deleted: ids.length })
  } catch (err) {
    console.error('[campaigns/leads/delete] Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
