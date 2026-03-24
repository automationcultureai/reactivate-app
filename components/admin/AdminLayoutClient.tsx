'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { RefreshCw } from 'lucide-react'
import { AdminSidebar } from './AdminSidebar'
import { cn } from '@/lib/utils'

export function AdminLayoutClient({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [collapsed, setCollapsed] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    const stored = localStorage.getItem('admin-sidebar-collapsed')
    if (stored !== null) setCollapsed(stored === 'true')
  }, [])

  function toggleSidebar() {
    setCollapsed((prev) => {
      localStorage.setItem('admin-sidebar-collapsed', String(!prev))
      return !prev
    })
  }

  function handleRefresh() {
    setRefreshing(true)
    router.refresh()
    setTimeout(() => setRefreshing(false), 600)
  }

  return (
    <div className="min-h-screen bg-background">
      <AdminSidebar collapsed={collapsed} onToggle={toggleSidebar} />
      <main className={cn('transition-[padding] duration-300', collapsed ? 'pl-16' : 'pl-60')}>
        <div className="max-w-7xl mx-auto px-6 py-8">
          <div className="flex justify-end mb-4">
            <button
              onClick={handleRefresh}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <RefreshCw className={cn('w-3.5 h-3.5', refreshing && 'animate-spin')} />
              Refresh
            </button>
          </div>
          {children}
        </div>
      </main>
    </div>
  )
}
