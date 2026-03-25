'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { ChevronDown, ChevronRight, Download } from 'lucide-react'
import { buttonVariants } from '@/lib/button-variants'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { BillingClientTable, type BillingBookingRow } from './BillingClientTable'

export type BillingClientData = {
  clientId: string
  clientName: string
  commissionPerJob: number
  totalOutstanding: number
  totalInvoiced: number
  totalPaid: number
  campaigns: Array<{ campaignId: string; campaignName: string; bookings: Omit<BillingBookingRow, 'campaignName'>[]; total: number }>
  sendLogCampaigns: Array<{ id: string; name: string }>
}

const fmt = (cents: number) => `$${(cents / 100).toFixed(2)}`

export function BillingClientList({ clientGroups }: { clientGroups: BillingClientData[] }) {
  const allIds = clientGroups.map((g) => g.clientId)
  const [expanded, setExpanded] = useState<Set<string>>(new Set(allIds))
  const allExpanded = expanded.size === allIds.length

  function toggleAll() {
    setExpanded(allExpanded ? new Set() : new Set(allIds))
  }

  function toggle(id: string) {
    setExpanded((prev) => {
      const n = new Set(prev)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button
          onClick={toggleAll}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          {allExpanded ? 'Collapse all' : 'Expand all'}
        </button>
      </div>

      {clientGroups.map((group) => {
        const isOpen = expanded.has(group.clientId)
        return (
          <div key={group.clientId} className="rounded-lg border border-border overflow-hidden">

            {/* Client header — clickable */}
            <button
              onClick={() => toggle(group.clientId)}
              className="w-full px-4 py-3 flex items-center gap-3 bg-muted/10 hover:bg-muted/20 transition-colors text-left"
            >
              {isOpen
                ? <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
                : <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
              }
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground truncate">{group.clientName}</p>
                <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                  {group.totalOutstanding > 0 && (
                    <span className="text-xs font-medium text-foreground">{fmt(group.totalOutstanding)} outstanding</span>
                  )}
                  {group.totalInvoiced > 0 && (
                    <span className="text-xs font-medium text-blue-600 dark:text-blue-400">{fmt(group.totalInvoiced)} invoiced</span>
                  )}
                  {group.totalPaid > 0 && (
                    <span className="text-xs font-medium text-green-600 dark:text-green-400">{fmt(group.totalPaid)} paid</span>
                  )}
                </div>
              </div>
              {/* Send log dropdown — stop propagation so clicking doesn't toggle */}
              {group.sendLogCampaigns.length > 0 && (
                <div
                  className="shrink-0"
                  onClick={(e) => e.stopPropagation()}
                >
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'text-xs h-7 gap-1.5')}
                    >
                      <Download className="w-3 h-3" />
                      Send logs
                      <ChevronDown className="w-3 h-3" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {group.sendLogCampaigns.map((c) => (
                        <DropdownMenuItem
                          key={c.id}
                          onClick={() => { window.location.href = `/api/billing/send-log/${c.id}` }}
                        >
                          <Download className="w-3 h-3 mr-2" />
                          {c.name}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              )}
            </button>

            {/* Flat booking table */}
            {isOpen && (
              <div className="border-t border-border">
                <BillingClientTable
                  bookings={group.campaigns.flatMap((c) =>
                    c.bookings.map((b) => ({ ...b, campaignName: c.campaignName }))
                  )}
                />
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
