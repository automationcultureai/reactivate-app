import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAdminUserId } from '@/lib/auth'
import { getSupabaseClient } from '@/lib/supabase'

const templateSchema = z.object({
  name: z.string().min(1, 'Template name is required').max(200),
  channel: z.enum(['email', 'sms', 'both']),
  tone_preset: z.enum(['professional', 'friendly', 'casual', 'empathetic', 'direct', 'authoritative', 'playful', 'sincere', 'nostalgic', 'consultative']),
  tone_custom: z.string().max(500).optional().nullable(),
  custom_instructions: z.string().max(2000).optional().nullable(),
})

export async function GET() {
  try {
    const adminUserId = await getAdminUserId()
    if (!adminUserId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getSupabaseClient()
    const { data: templates, error } = await supabase
      .from('campaign_templates')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      console.error('[templates/list] Supabase error:', error.message)
      return NextResponse.json({ error: 'Failed to fetch templates' }, { status: 500 })
    }

    return NextResponse.json({ templates })
  } catch (err) {
    console.error('[templates/list] Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const adminUserId = await getAdminUserId()
    if (!adminUserId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const parsed = templateSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid input' },
        { status: 400 }
      )
    }

    const supabase = getSupabaseClient()
    const { data: template, error } = await supabase
      .from('campaign_templates')
      .insert({
        name: parsed.data.name,
        channel: parsed.data.channel,
        tone_preset: parsed.data.tone_preset,
        tone_custom: parsed.data.tone_custom ?? null,
        custom_instructions: parsed.data.custom_instructions ?? null,
      })
      .select()
      .single()

    if (error) {
      console.error('[templates/create] Supabase error:', error.message)
      return NextResponse.json({ error: 'Failed to create template' }, { status: 500 })
    }

    return NextResponse.json({ template }, { status: 201 })
  } catch (err) {
    console.error('[templates/create] Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
