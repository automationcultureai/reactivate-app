import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAdminUserId } from '@/lib/auth'
import { getSupabaseClient } from '@/lib/supabase'
import { createClientOrganization } from '@/lib/clerk'

const createClientSchema = z.object({
  name: z.string().min(1, 'Business name is required').max(200),
  email: z.string().email('Invalid email address'),
  commission_dollars: z
    .string()
    .refine((v) => !isNaN(parseFloat(v)) && parseFloat(v) >= 0, {
      message: 'Commission must be a non-negative number',
    }),
  google_calendar_id: z.string().max(500).nullable().optional(),
  notes: z.string().max(5000).nullable().optional(),
})

export async function POST(req: NextRequest) {
  try {
    // 1. Verify admin auth
    const adminUserId = await getAdminUserId()
    if (!adminUserId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // 2. Parse + validate input
    const body = await req.json()
    const parsed = createClientSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid input' },
        { status: 400 }
      )
    }

    const { name, email, commission_dollars, google_calendar_id, notes } = parsed.data

    // Convert dollars to cents (store as integer)
    const commission_per_job = Math.round(parseFloat(commission_dollars) * 100)

    // 3. Create Clerk organisation for the client
    let clerkOrgId: string
    try {
      clerkOrgId = await createClientOrganization(name, adminUserId)
    } catch (err) {
      console.error('[clients/create] Clerk org creation failed:', err)
      return NextResponse.json(
        { error: 'Failed to create client organisation. Please try again.' },
        { status: 500 }
      )
    }

    // 4. Insert client record with clerk_org_id
    const supabase = getSupabaseClient()
    const { data: client, error } = await supabase
      .from('clients')
      .insert({
        name,
        email,
        commission_per_job,
        google_calendar_id: google_calendar_id ?? null,
        notes: notes ?? null,
        clerk_org_id: clerkOrgId,
      })
      .select()
      .single()

    if (error) {
      console.error('[clients/create] Supabase insert failed:', error.message)
      return NextResponse.json(
        { error: 'Failed to save client. Please try again.' },
        { status: 500 }
      )
    }

    return NextResponse.json({ client }, { status: 201 })
  } catch (err) {
    console.error('[clients/create] Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
