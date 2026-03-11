import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseClient } from '@/lib/supabase'
import { getAdminUserId } from '@/lib/auth'

interface Props {
  params: Promise<{ clientId: string }>
}

export async function PATCH(req: NextRequest, { params }: Props) {
  const adminId = await getAdminUserId()
  if (!adminId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { clientId } = await params
  const body = await req.json()
  const { client_industry } = body as { client_industry: string | null }

  const supabase = getSupabaseClient()
  const { error } = await supabase
    .from('clients')
    .update({ client_industry: client_industry ?? null })
    .eq('id', clientId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
