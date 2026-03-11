'use client'

import { useState } from 'react'
import { Client } from '@/lib/supabase'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/lib/button-variants'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import Link from 'next/link'
import { Mail, DollarSign, Calendar, Plus, Pencil } from 'lucide-react'
import { ClientEditDialog } from '@/components/admin/ClientEditDialog'

interface ClientDetailHeaderProps {
  client: Client
}

export function ClientDetailHeader({ client: initialClient }: ClientDetailHeaderProps) {
  const [client, setClient] = useState(initialClient)
  const [editOpen, setEditOpen] = useState(false)

  return (
    <>
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-3">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">{client.name}</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Client account</p>
          </div>

          <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <Mail className="w-3.5 h-3.5" />
              {client.email}
            </span>
            <span className="flex items-center gap-1.5">
              <DollarSign className="w-3.5 h-3.5" />
              ${(client.commission_per_job / 100).toFixed(2)} per completed job
            </span>
            <span className="flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5" />
              {client.google_calendar_id ? (
                <Badge variant="secondary" className="text-xs">Calendar connected</Badge>
              ) : (
                <Badge variant="outline" className="text-xs text-muted-foreground">
                  No calendar
                </Badge>
              )}
            </span>
          </div>

          {client.clerk_org_id && (
            <p className="text-xs text-muted-foreground font-mono">
              Org: {client.clerk_org_id}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
            <Pencil className="w-3.5 h-3.5 mr-1.5" />
            Edit
          </Button>
          <Link
            href={`/admin/clients/${client.id}/campaigns/new`}
            className={cn(buttonVariants())}
          >
            <Plus className="w-4 h-4 mr-2" />
            New campaign
          </Link>
        </div>
      </div>

      <ClientEditDialog
        client={client}
        open={editOpen}
        onOpenChange={setEditOpen}
        onSaved={(updated) => setClient(updated)}
      />
    </>
  )
}
