import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAdminUserId } from '@/lib/auth'
import { getSupabaseClient } from '@/lib/supabase'

const updateTemplateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  channel: z.enum(['email', 'sms', 'both']).optional(),
  tone_preset: z.enum(['professional', 'friendly', 'casual', 'empathetic', 'direct', 'authoritative', 'playful', 'sincere', 'nostalgic', 'consultative']).optional(),
  tone_custom: z.string().max(500).nullable().optional(),
  custom_instructions: z.string().max(2000).nullable().optional(),
})

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ templateId: string }> }
) {
  try {
    const adminUserId = await getAdminUserId()
    if (!adminUserId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { templateId } = await params
    const supabase = getSupabaseClient()
    const { data: template, error } = await supabase
      .from('campaign_templates')
      .select('*')
      .eq('id', templateId)
      .single()

    if (error) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 })
    }

    return NextResponse.json({ template })
  } catch (err) {
    console.error('[templates/get] Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ templateId: string }> }
) {
  try {
    const adminUserId = await getAdminUserId()
    if (!adminUserId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { templateId } = await params
    const body = await req.json()
    const parsed = updateTemplateSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid input' },
        { status: 400 }
      )
    }

    const supabase = getSupabaseClient()
    const { data: template, error } = await supabase
      .from('campaign_templates')
      .update(parsed.data)
      .eq('id', templateId)
      .select()
      .single()

    if (error) {
      console.error('[templates/update] Supabase error:', error.message)
      return NextResponse.json({ error: 'Failed to update template' }, { status: 500 })
    }

    return NextResponse.json({ template })
  } catch (err) {
    console.error('[templates/update] Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ templateId: string }> }
) {
  try {
    const adminUserId = await getAdminUserId()
    if (!adminUserId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { templateId } = await params
    const supabase = getSupabaseClient()
    const { error } = await supabase
      .from('campaign_templates')
      .delete()
      .eq('id', templateId)

    if (error) {
      console.error('[templates/delete] Supabase error:', error.message)
      return NextResponse.json({ error: 'Failed to delete template' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[templates/delete] Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
