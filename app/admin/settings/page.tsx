import { clerkClient } from '@clerk/nextjs/server'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Users, Key, Info, Activity } from 'lucide-react'
import { SystemHealthCard } from '@/components/admin/SystemHealthCard'
import { isCalendarConfigured } from '@/lib/calendar'
import { isTwilioConfigured } from '@/lib/twilio'
import type { HealthStatus } from '@/app/api/admin/health/route'

interface ClerkUser {
  id: string
  emailAddresses: { emailAddress: string }[]
  firstName: string | null
  lastName: string | null
}

async function getAdminUsers(): Promise<{ id: string; email: string; name: string }[]> {
  const rawIds = process.env.ADMIN_USER_IDS ?? ''
  const adminIds = rawIds
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean)

  if (adminIds.length === 0) return []

  try {
    const clerk = await clerkClient()
    const users = await Promise.all(
      adminIds.map(async (id) => {
        try {
          const u = await clerk.users.getUser(id) as ClerkUser
          const email = u.emailAddresses[0]?.emailAddress ?? 'No email'
          const name = [u.firstName, u.lastName].filter(Boolean).join(' ') || 'No name set'
          return { id, email, name }
        } catch {
          // User ID might not exist in Clerk — show ID only
          return { id, email: '(user not found)', name: id }
        }
      })
    )
    return users
  } catch {
    // If Clerk isn't configured, fall back to showing raw IDs
    return adminIds.map((id) => ({ id, email: '(Clerk not configured)', name: id }))
  }
}

export default async function SettingsPage() {
  const adminUsers = await getAdminUsers()
  const rawIds = process.env.ADMIN_USER_IDS ?? ''

  // Build initial health status server-side (no live calendar test — use "Test connections" button)
  const initialHealth: HealthStatus = {
    calendar: { configured: isCalendarConfigured(), working: false },
    twilio:   { configured: isTwilioConfigured() },
    email:    { configured: !!(process.env.RESEND_API_KEY) },
  }

  return (
    <div className="space-y-8 max-w-2xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">Agency configuration and admin access</p>
      </div>

      {/* System Status */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-muted-foreground" />
            <CardTitle className="text-base">System status</CardTitle>
          </div>
          <CardDescription>
            Integration status for email, SMS, and calendar. Click &ldquo;Test connections&rdquo; to verify live OAuth.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SystemHealthCard initial={initialHealth} />
        </CardContent>
      </Card>

      <Separator />

      {/* Admin users */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-muted-foreground" />
            <CardTitle className="text-base">Admin users</CardTitle>
          </div>
          <CardDescription>
            All users listed here have full admin access to all clients, campaigns, and billing.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {adminUsers.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No admin users configured. Add Clerk user IDs to{' '}
              <span className="font-mono text-xs">ADMIN_USER_IDS</span>.
            </p>
          ) : (
            <div className="space-y-2">
              {adminUsers.map((user) => (
                <div
                  key={user.id}
                  className="flex items-center justify-between p-3 rounded-lg border border-border"
                >
                  <div className="space-y-0.5">
                    <p className="text-sm font-medium text-foreground">{user.name}</p>
                    <p className="text-xs text-muted-foreground">{user.email}</p>
                  </div>
                  <Badge variant="secondary" className="text-xs font-mono">
                    {user.id.slice(0, 16)}…
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Separator />

      {/* How to invite a new admin */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Key className="w-4 h-4 text-muted-foreground" />
            <CardTitle className="text-base">Add an admin user</CardTitle>
          </div>
          <CardDescription>
            Follow these steps to give another team member full admin access.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-muted-foreground">
          <ol className="space-y-3 list-decimal list-inside">
            <li>
              Share the sign-up link with your team member:{' '}
              <span className="font-mono text-xs text-foreground">
                {process.env.NEXT_PUBLIC_APP_URL}/sign-up
              </span>
            </li>
            <li>
              They sign up and land on the client dashboard (they&apos;ll see an empty state).
            </li>
            <li>
              Find their Clerk user ID: open{' '}
              <span className="font-mono text-xs">dashboard.clerk.com</span> → Users → click their
              account → copy the User ID (starts with <span className="font-mono text-xs">user_</span>
              ).
            </li>
            <li>
              Add it to your{' '}
              <span className="font-mono text-xs">.env.local</span> and Vercel environment
              variables, comma-separated:
              <pre className="mt-2 p-3 rounded-md bg-muted text-xs font-mono overflow-x-auto">
                {`ADMIN_USER_IDS=${rawIds || 'user_existing_id'},user_new_id`}
              </pre>
            </li>
            <li>Redeploy — their next page load will have full admin access.</li>
          </ol>

          <div className="flex items-start gap-2 p-3 rounded-md bg-muted/50 mt-4">
            <Info className="w-4 h-4 shrink-0 mt-0.5 text-muted-foreground" />
            <p className="text-xs">
              All admin users have identical permissions in V1. Role-based access control (RBAC) is
              out of scope for this version.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Current env var */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Current ADMIN_USER_IDS</CardTitle>
          <CardDescription>The raw value from your environment variables.</CardDescription>
        </CardHeader>
        <CardContent>
          <pre className="p-3 rounded-md bg-muted text-xs font-mono overflow-x-auto">
            {rawIds || '(not set)'}
          </pre>
        </CardContent>
      </Card>
    </div>
  )
}
