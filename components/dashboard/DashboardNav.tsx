'use client'

import { useState } from 'react'
import { SignOutButton } from '@clerk/nextjs'
import { Zap, LogOut, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ThemeToggle } from '@/components/ui/ThemeToggle'

interface DashboardNavProps {
  clientName: string
}

export function DashboardNav({ clientName }: DashboardNavProps) {
  const [refreshing, setRefreshing] = useState(false)

  function refresh() {
    setRefreshing(true)
    window.location.reload()
  }

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur-xl dark:bg-black/40 dark:border-white/[0.06] dark:shadow-[0_1px_0_rgba(255,255,255,0.04),0_4px_24px_rgba(0,0,0,0.4)] midnight:bg-black/50 midnight:border-white/[0.06]">
      <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-muted-foreground/70">
            <div className="flex items-center justify-center w-5 h-5 rounded-md bg-blue-500/15 border border-blue-400/25 dark:bg-blue-500/20 dark:border-blue-400/30">
              <Zap className="w-3 h-3 text-blue-500 dark:text-blue-400" />
            </div>
            <span className="text-sm font-medium">Automation Culture</span>
          </div>
          <span className="text-muted-foreground/30 text-sm">/</span>
          <span className="text-sm font-medium text-foreground">{clientName}</span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
            onClick={refresh}
            disabled={refreshing}
            title="Refresh dashboard"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          </Button>
          <ThemeToggle />
          <SignOutButton redirectUrl="/sign-in">
            <Button variant="ghost" size="sm" className="text-muted-foreground">
              <LogOut className="w-3.5 h-3.5 mr-1.5" />
              Sign out
            </Button>
          </SignOutButton>
        </div>
      </div>
    </header>
  )
}
