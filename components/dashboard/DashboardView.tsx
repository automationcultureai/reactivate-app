'use client'

import { useState } from 'react'
import { LayoutGrid, BarChart2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DashboardStats } from './DashboardStats'
import { DashboardCharts } from './DashboardCharts'

interface DashboardViewProps {
  // Stats props
  totalLeads: number
  bookedCount: number
  emailsSent: number
  openedCount: number
  clickedCount: number
  completedCount: number
  totalSpend: number
  smsSent: number
  smsOptedOut: number
  uniqueSmsLeads: number
  smsSeqCounts: { sms1: number; sms2: number; sms3: number; sms4: number }
  // Chart props
  bookingsByMonth: { month: string; bookings: number; completed: number }[]
}

export function DashboardView(props: DashboardViewProps) {
  const [view, setView] = useState<'stats' | 'charts'>('stats')

  return (
    <div className="space-y-4">
      {/* Toggle */}
      <div className="flex items-center gap-1 p-1 bg-muted/30 rounded-lg w-fit">
        <Button
          variant="ghost"
          size="sm"
          className={`h-7 px-3 text-xs gap-1.5 rounded-md ${view === 'stats' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground'}`}
          onClick={() => setView('stats')}
        >
          <LayoutGrid className="w-3.5 h-3.5" />
          Overview
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className={`h-7 px-3 text-xs gap-1.5 rounded-md ${view === 'charts' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground'}`}
          onClick={() => setView('charts')}
        >
          <BarChart2 className="w-3.5 h-3.5" />
          Charts
        </Button>
      </div>

      {view === 'stats' ? (
        <DashboardStats
          totalLeads={props.totalLeads}
          bookedCount={props.bookedCount}
          emailsSent={props.emailsSent}
          openedCount={props.openedCount}
          clickedCount={props.clickedCount}
          completedCount={props.completedCount}
          totalSpend={props.totalSpend}
          smsSent={props.smsSent}
          smsOptedOut={props.smsOptedOut}
          uniqueSmsLeads={props.uniqueSmsLeads}
          smsSeqCounts={props.smsSeqCounts}
        />
      ) : (
        <DashboardCharts
          funnel={{
            totalLeads: props.totalLeads,
            emailsSent: props.emailsSent,
            clickedCount: props.clickedCount,
            bookedCount: props.bookedCount,
            completedCount: props.completedCount,
          }}
          bookingsByMonth={props.bookingsByMonth}
        />
      )}
    </div>
  )
}
