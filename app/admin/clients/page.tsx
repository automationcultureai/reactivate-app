import Link from 'next/link'
import { getSupabaseClient } from '@/lib/supabase'
import { ClientTable } from '@/components/admin/ClientTable'
import { cn } from '@/lib/utils'
import { buttonVariants } from '@/lib/button-variants'
import { Plus, AlertCircle } from 'lucide-react'

export default async function ClientsPage() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let clients: any[] = []
  let fetchError: string | null = null

  try {
    const supabase = getSupabaseClient()
    const { data, error } = await supabase
      .from('clients')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      // Log full error to Vercel function logs for debugging
      console.error('[/admin/clients] Supabase query error:', error)
      fetchError = error.message
    } else {
      clients = data ?? []
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[/admin/clients] Unexpected error:', message)
    fetchError = message
  }

  if (fetchError) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold text-foreground">Clients</h1>
        <div className="flex items-start gap-3 p-4 rounded-lg border border-destructive/30 bg-destructive/5">
          <AlertCircle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="text-sm font-medium text-destructive">Failed to load clients</p>
            <p className="text-xs text-muted-foreground font-mono">{fetchError}</p>
            <p className="text-xs text-muted-foreground mt-2">
              Check that <span className="font-mono">SUPABASE_SERVICE_ROLE_KEY</span> is correctly
              set in your Vercel environment variables (not the anon key). Then redeploy.
            </p>
          </div>
        </div>
      </div>
    )
  }

  const safeClients = clients ?? []

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Clients</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {safeClients.length} client{safeClients.length !== 1 ? 's' : ''} total
          </p>
        </div>
        <Link href="/admin/clients/new" className={cn(buttonVariants())}>
          <Plus className="w-4 h-4 mr-2" />
          Add client
        </Link>
      </div>

      {/* Client table */}
      <ClientTable clients={safeClients} />
    </div>
  )
}
