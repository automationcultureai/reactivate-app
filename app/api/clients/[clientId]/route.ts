import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAdminUserId } from '@/lib/auth'
import { getSupabaseClient } from '@/lib/supabase'

const availabilityHoursSchema = z.object({
  timezone: z.string().min(1).max(100),
  days: z.array(z.number().int().min(0).max(6)),
  start_hour: z.number().int().min(0).max(22),
  end_hour: z.number().int().min(1).max(23),
})

const updateClientSchema = z.object({
  notes: z.string().max(5000).nullable().optional(),
  google_calendar_id: z.string().max(500).nullable().optional(),
  commission_per_job: z.number().int().min(0).optional(),
  name: z.string().min(1).max(200).optional(),
  email: z.string().email().optional(),
  business_name: z.string().max(200).nullable().optional(),
  business_address: z.string().max(500).nullable().optional(),
  availability_hours: availabilityHoursSchema.nullable().optional(),
})

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ clientId: string }> }
) {
  try {
    // 1. Verify admin auth
    const adminUserId = await getAdminUserId()
    if (!adminUserId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { clientId } = await params

    // 2. Validate input
    const body = await req.json()
    const parsed = updateClientSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid input' },
        { status: 400 }
      )
    }

    // 3. Update client record (only send fields that were provided)
    const updateData: Record<string, unknown> = {}
    if (parsed.data.notes !== undefined) updateData.notes = parsed.data.notes
    if (parsed.data.google_calendar_id !== undefined) updateData.google_calendar_id = parsed.data.google_calendar_id
    if (parsed.data.commission_per_job !== undefined) updateData.commission_per_job = parsed.data.commission_per_job
    if (parsed.data.name !== undefined) updateData.name = parsed.data.name
    if (parsed.data.email !== undefined) updateData.email = parsed.data.email
    if (parsed.data.business_name !== undefined) updateData.business_name = parsed.data.business_name
    if (parsed.data.business_address !== undefined) updateData.business_address = parsed.data.business_address
    if (parsed.data.availability_hours !== undefined) updateData.availability_hours = parsed.data.availability_hours

    const supabase = getSupabaseClient()
    const { data: client, error } = await supabase
      .from('clients')
      .update(updateData)
      .eq('id', clientId)
      .select()
      .single()

    if (error) {
      console.error('[clients/update] Supabase update failed:', error.message)
      return NextResponse.json({ error: 'Failed to update client' }, { status: 500 })
    }

    return NextResponse.json({ client })
  } catch (err) {
    console.error('[clients/update] Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ clientId: string }> }
) {
  try {
    const adminUserId = await getAdminUserId()
    if (!adminUserId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { clientId } = await params
    const supabase = getSupabaseClient()
    const { data: client, error } = await supabase
      .from('clients')
      .select('*')
      .eq('id', clientId)
      .single()

    if (error) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 })
    }

    return NextResponse.json({ client })
  } catch (err) {
    console.error('[clients/get] Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
