import Link from 'next/link'
import { getSupabaseClient } from '@/lib/supabase'
import { ClientTable } from '@/components/admin/ClientTable'
import { cn } from '@/lib/utils'
import { buttonVariants } from '@/lib/button-variants'
import { Plus } from 'lucide-react'

export default async function ClientsPage() {
  const supabase = getSupabaseClient()
  const { data: clients, error } = await supabase
    .from('clients')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) {
    return (
      <div className="text-destructive text-sm">
        Failed to load clients. Please try again.
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Clients</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {clients.length} client{clients.length !== 1 ? 's' : ''} total
          </p>
        </div>
        <Link href="/admin/clients/new" className={cn(buttonVariants())}>
          <Plus className="w-4 h-4 mr-2" />
          Add client
        </Link>
      </div>

      {/* Client table */}
      <ClientTable clients={clients} />
    </div>
  )
}
