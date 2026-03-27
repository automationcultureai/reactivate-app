import Link from 'next/link'
import { getSupabaseClient } from '@/lib/supabase'
import { ClientsPageClient } from '@/components/admin/ClientsPageClient'
import { cn } from '@/lib/utils'
import { buttonVariants } from '@/lib/button-variants'
import { Plus, AlertCircle } from 'lucide-react'

type ClientSortKey = 'name' | 'created_at'

interface Props {
  searchParams: Promise<{ sort?: string; dir?: string }>
}

export default async function ClientsPage({ searchParams }: Props) {
  const { sort = 'created_at', dir = 'desc' } = await searchParams
  const sortKey = (['name', 'created_at'].includes(sort) ? sort : 'created_at') as ClientSortKey
  const ascending = dir === 'asc'

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let clients: any[] = []
  let fetchError: string | null = null

  try {
    const supabase = getSupabaseClient()
    const { data, error } = await supabase
      .from('clients')
      .select('*')
      .order(sortKey, { ascending })

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

  function clientSortHref(key: ClientSortKey) {
    const newDir = sortKey === key && !ascending ? 'asc' : 'desc'
    return `?sort=${key}&dir=${newDir}`
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Clients</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {safeClients.length} client{safeClients.length !== 1 ? 's' : ''} total
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <span>Sort:</span>
            <a href={clientSortHref('name')} className={`px-2 py-1 rounded transition-colors ${sortKey === 'name' ? 'bg-muted text-foreground font-medium' : 'hover:bg-muted/50'}`}>
              Name{sortKey === 'name' ? (ascending ? ' ↑' : ' ↓') : ''}
            </a>
            <a href={clientSortHref('created_at')} className={`px-2 py-1 rounded transition-colors ${sortKey === 'created_at' ? 'bg-muted text-foreground font-medium' : 'hover:bg-muted/50'}`}>
              Newest{sortKey === 'created_at' ? (ascending ? ' ↑' : ' ↓') : ''}
            </a>
          </div>
          <Link href="/admin/clients/new" className={cn(buttonVariants())}>
            <Plus className="w-4 h-4 mr-2" />
            Add client
          </Link>
        </div>
      </div>

      {/* Client table with search */}
      <ClientsPageClient clients={safeClients} />
    </div>
  )
}
