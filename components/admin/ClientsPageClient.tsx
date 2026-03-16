'use client'

import { useState } from 'react'
import { Search, X } from 'lucide-react'
import { Client } from '@/lib/supabase'
import { ClientTable } from '@/components/admin/ClientTable'

interface ClientsPageClientProps {
  clients: Client[]
}

export function ClientsPageClient({ clients }: ClientsPageClientProps) {
  const [search, setSearch] = useState('')

  const filtered = search.trim()
    ? clients.filter(
        (c) =>
          c.name.toLowerCase().includes(search.trim().toLowerCase()) ||
          (c.business_name ?? '').toLowerCase().includes(search.trim().toLowerCase())
      )
    : clients

  return (
    <div className="space-y-4">
      {/* Search input */}
      <div className="relative max-w-xs">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
        <input
          type="text"
          placeholder="Search clients by name…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-9 pr-8 py-2 text-sm rounded-md border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
        {search && (
          <button
            onClick={() => setSearch('')}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      {search && (
        <p className="text-xs text-muted-foreground -mt-1">
          {filtered.length} of {clients.length} client{clients.length !== 1 ? 's' : ''}
        </p>
      )}

      <ClientTable clients={filtered} />
    </div>
  )
}
