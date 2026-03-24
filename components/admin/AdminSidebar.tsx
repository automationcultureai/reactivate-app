'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { SignOutButton, useUser } from '@clerk/nextjs'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard,
  Users,
  FileText,
  AlertCircle,
  CreditCard,
  Settings,
  Zap,
  LogOut,
  CalendarDays,
  Activity,
  BarChart2,
  ChevronLeft,
  RefreshCw,
} from 'lucide-react'
import { ThemeToggle } from '@/components/ui/ThemeToggle'

const navItems = [
  { label: 'Dashboard', href: '/admin', icon: LayoutDashboard, exact: true },
  { label: 'Clients', href: '/admin/clients', icon: Users, exact: false },
  { label: 'Bookings', href: '/admin/bookings', icon: CalendarDays, exact: false },
  { label: 'Templates', href: '/admin/templates', icon: FileText, exact: false },
  { label: 'Disputes', href: '/admin/disputes', icon: AlertCircle, exact: false },
  { label: 'Billing', href: '/admin/billing', icon: CreditCard, exact: false },
  { label: 'Deliverability', href: '/admin/deliverability', icon: Activity, exact: false },
  { label: 'Intelligence', href: '/admin/intelligence', icon: BarChart2, exact: false },
  { label: 'Settings', href: '/admin/settings', icon: Settings, exact: false },
]

interface AdminSidebarProps {
  collapsed: boolean
  onToggle: () => void
  onRefresh: () => void
  refreshing: boolean
}

export function AdminSidebar({ collapsed, onToggle, onRefresh, refreshing }: AdminSidebarProps) {
  const pathname = usePathname()
  const { user } = useUser()

  function isActive(href: string, exact: boolean) {
    if (exact) return pathname === href
    return pathname.startsWith(href)
  }

  return (
    <aside
      className={cn(
        'fixed inset-y-0 left-0 z-40 flex flex-col bg-sidebar border-r border-sidebar-border transition-[width] duration-300 overflow-hidden',
        collapsed ? 'w-16' : 'w-60'
      )}
    >
      {/* Brand + collapse toggle */}
      <div className="flex items-center gap-2 px-4 h-16 border-b border-sidebar-border shrink-0">
        <div className="flex items-center justify-center w-7 h-7 rounded-md bg-primary shrink-0">
          <Zap className="w-4 h-4 text-primary-foreground" />
        </div>
        {!collapsed && (
          <>
            <span className="flex-1 font-semibold text-sidebar-foreground tracking-tight truncate">
              Reactivate
            </span>
            <button
              onClick={onToggle}
              title="Collapse sidebar"
              className="p-1 rounded-md text-sidebar-foreground/40 hover:text-sidebar-foreground hover:bg-sidebar-accent/50 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
          </>
        )}
        {collapsed && (
          <button
            onClick={onToggle}
            title="Expand sidebar"
            className="p-1 rounded-md text-sidebar-foreground/40 hover:text-sidebar-foreground hover:bg-sidebar-accent/50 transition-colors"
          >
            <ChevronLeft className="w-4 h-4 rotate-180" />
          </button>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 py-4 space-y-0.5 overflow-y-auto overflow-x-hidden">
        {navItems.map((item) => {
          const active = isActive(item.href, item.exact)
          return (
            <Link
              key={item.href}
              href={item.href}
              title={collapsed ? item.label : undefined}
              className={cn(
                'flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors',
                collapsed && 'justify-center',
                active
                  ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                  : 'text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50'
              )}
            >
              <item.icon className="w-4 h-4 shrink-0" />
              {!collapsed && item.label}
            </Link>
          )
        })}
      </nav>

      {/* Footer */}
      <div className="px-2 py-4 border-t border-sidebar-border shrink-0 space-y-3">
        {!collapsed && user && (
          <div className="px-2 space-y-0.5">
            <p className="text-xs font-medium text-sidebar-foreground truncate">
              {user.primaryEmailAddress?.emailAddress}
            </p>
            <p className="text-xs text-sidebar-foreground/40">Admin</p>
          </div>
        )}
        <div className={cn('flex items-center gap-2', collapsed && 'flex-col')}>
          <SignOutButton redirectUrl="/sign-in">
            <button
              title={collapsed ? 'Sign out' : undefined}
              className={cn(
                'flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50 transition-colors',
                collapsed ? 'justify-center w-full' : 'flex-1'
              )}
            >
              <LogOut className="w-4 h-4 shrink-0" />
              {!collapsed && 'Sign out'}
            </button>
          </SignOutButton>
          <button
            onClick={onRefresh}
            title="Refresh"
            className="p-2 rounded-md text-sidebar-foreground/40 hover:text-sidebar-foreground hover:bg-sidebar-accent/50 transition-colors"
          >
            <RefreshCw className={cn('w-4 h-4', refreshing && 'animate-spin')} />
          </button>
          <ThemeToggle />
        </div>
      </div>
    </aside>
  )
}
