'use client'

import Link from 'next/link'
import { formatDistanceToNow } from 'date-fns'
import { Client } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import { buttonVariants } from '@/lib/button-variants'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { ArrowRight } from 'lucide-react'

interface ClientTableProps {
  clients: Client[]
}

export function ClientTable({ clients }: ClientTableProps) {
  if (clients.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center border border-dashed border-border rounded-lg">
        <p className="text-lg font-medium text-foreground">No clients yet</p>
        <p className="text-sm text-muted-foreground mt-1">
          Add your first client to get started.
        </p>
        <Link href="/admin/clients/new" className={cn(buttonVariants(), 'mt-4')}>
          Add client
        </Link>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/30">
            <TableHead className="font-medium">Client</TableHead>
            <TableHead className="font-medium">Email</TableHead>
            <TableHead className="font-medium">Commission / job</TableHead>
            <TableHead className="font-medium">Calendar connected</TableHead>
            <TableHead className="font-medium">Added</TableHead>
            <TableHead className="w-12" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {clients.map((client) => (
            <TableRow key={client.id} className="hover:bg-muted/20 transition-colors">
              <TableCell className="font-medium text-foreground">
                {client.name}
              </TableCell>
              <TableCell className="text-muted-foreground">{client.email}</TableCell>
              <TableCell>
                <span className="font-mono text-foreground">
                  ${(client.commission_per_job / 100).toFixed(2)}
                </span>
              </TableCell>
              <TableCell>
                {client.google_calendar_id ? (
                  <Badge variant="secondary" className="text-xs">Connected</Badge>
                ) : (
                  <Badge variant="outline" className="text-xs text-muted-foreground">
                    Not set
                  </Badge>
                )}
              </TableCell>
              <TableCell className="text-muted-foreground text-sm">
                {formatDistanceToNow(new Date(client.created_at), { addSuffix: true })}
              </TableCell>
              <TableCell>
                <Link
                  href={`/admin/clients/${client.id}`}
                  className={cn(buttonVariants({ variant: 'ghost', size: 'icon' }))}
                >
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
