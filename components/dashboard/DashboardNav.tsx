'use client'

import { SignOutButton } from '@clerk/nextjs'
import { Zap, LogOut } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ThemeToggle } from '@/components/ui/ThemeToggle'

interface DashboardNavProps {
  clientName: string
}

export function DashboardNav({ clientName }: DashboardNavProps) {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur">
      <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-muted-foreground/60">
            <Zap className="w-3.5 h-3.5" />
            <span className="text-xs font-medium">Reactivate</span>
          </div>
          <span className="text-muted-foreground/30 text-xs">/</span>
          <span className="text-sm font-medium text-foreground">{clientName}</span>
        </div>
        <div className="flex items-center gap-1">
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
