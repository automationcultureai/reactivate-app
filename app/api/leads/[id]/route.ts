import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAdminUserId } from '@/lib/auth'
import { getSupabaseClient } from '@/lib/supabase'

const updateLeadSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  email: z.string().email().nullable().optional(),
  phone: z.string().min(7).max(20).nullable().optional(),
  last_contact_date: z.string().max(100).nullable().optional(),
  service_type: z.string().max(200).nullable().optional(),
  purchase_value: z.string().max(100).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
})

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const adminUserId = await getAdminUserId()
    if (!adminUserId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: leadId } = await params

    const body = await req.json()
    const parsed = updateLeadSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid input' },
        { status: 400 }
      )
    }

    const supabase = getSupabaseClient()

    // Verify lead exists
    const { data: existing, error: fetchError } = await supabase
      .from('leads')
      .select('id, status')
      .eq('id', leadId)
      .single()

    if (fetchError || !existing) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
    }

    if (existing.status === 'deleted') {
      return NextResponse.json({ error: 'Cannot edit an erased lead' }, { status: 409 })
    }

    const updateData: Record<string, unknown> = {}
    if (parsed.data.name !== undefined) updateData.name = parsed.data.name
    if (parsed.data.email !== undefined) updateData.email = parsed.data.email
    if (parsed.data.phone !== undefined) updateData.phone = parsed.data.phone
    if (parsed.data.last_contact_date !== undefined) updateData.last_contact_date = parsed.data.last_contact_date
    if (parsed.data.service_type !== undefined) updateData.service_type = parsed.data.service_type
    if (parsed.data.purchase_value !== undefined) updateData.purchase_value = parsed.data.purchase_value
    if (parsed.data.notes !== undefined) updateData.notes = parsed.data.notes

    const { data: lead, error: updateError } = await supabase
      .from('leads')
      .update(updateData)
      .eq('id', leadId)
      .select()
      .single()

    if (updateError) {
      console.error('[leads/update] Supabase update failed:', updateError.message)
      return NextResponse.json({ error: 'Failed to update lead' }, { status: 500 })
    }

    return NextResponse.json({ lead })
  } catch (err) {
    console.error('[leads/update] Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
