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
} from 'lucide-react'
import { ThemeToggle } from '@/components/ui/ThemeToggle'

const navItems = [
  { label: 'Dashboard', href: '/admin', icon: LayoutDashboard, exact: true },
  { label: 'Clients', href: '/admin/clients', icon: Users, exact: false },
  { label: 'Templates', href: '/admin/templates', icon: FileText, exact: false },
  { label: 'Disputes', href: '/admin/disputes', icon: AlertCircle, exact: false },
  { label: 'Billing', href: '/admin/billing', icon: CreditCard, exact: false },
  { label: 'Settings', href: '/admin/settings', icon: Settings, exact: false },
]

export function AdminSidebar() {
  const pathname = usePathname()
  const { user } = useUser()

  function isActive(href: string, exact: boolean) {
    if (exact) return pathname === href
    return pathname.startsWith(href)
  }

  return (
    <aside className="fixed inset-y-0 left-0 z-40 w-60 flex flex-col bg-sidebar border-r border-sidebar-border">
      {/* Brand */}
      <div className="flex items-center gap-2 px-5 h-16 border-b border-sidebar-border shrink-0">
        <div className="flex items-center justify-center w-7 h-7 rounded-md bg-primary">
          <Zap className="w-4 h-4 text-primary-foreground" />
        </div>
        <span className="font-semibold text-sidebar-foreground tracking-tight">
          Reactivate
        </span>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {navItems.map((item) => {
          const active = isActive(item.href, item.exact)
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors',
                active
                  ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                  : 'text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50'
              )}
            >
              <item.icon className="w-4 h-4 shrink-0" />
              {item.label}
            </Link>
          )
        })}
      </nav>

      {/* Footer with user info + sign out */}
      <div className="px-3 py-4 border-t border-sidebar-border shrink-0 space-y-3">
        {user && (
          <div className="px-2 space-y-0.5">
            <p className="text-xs font-medium text-sidebar-foreground truncate">
              {user.primaryEmailAddress?.emailAddress}
            </p>
            <p className="text-xs text-sidebar-foreground/40">Admin</p>
          </div>
        )}
        <div className="flex items-center gap-2">
          <SignOutButton redirectUrl="/sign-in">
            <button className="flex flex-1 items-center gap-3 px-3 py-2 rounded-md text-sm font-medium text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50 transition-colors">
              <LogOut className="w-4 h-4 shrink-0" />
              Sign out
            </button>
          </SignOutButton>
          <ThemeToggle />
        </div>
      </div>
    </aside>
  )
}
