'use client'

import { useState } from 'react'
import { CheckCircle, XCircle, AlertCircle, Loader2, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { HealthStatus } from '@/app/api/admin/health/route'

interface Row {
  label: string
  configured: boolean
  working?: boolean
  error?: string
}

function StatusDot({ configured, working }: { configured: boolean; working?: boolean }) {
  if (!configured) {
    return <XCircle className="w-4 h-4 text-muted-foreground/50" />
  }
  if (working === false) {
    return <AlertCircle className="w-4 h-4 text-amber-500" />
  }
  if (working === true) {
    return <CheckCircle className="w-4 h-4 text-green-500" />
  }
  // configured but not tested
  return <CheckCircle className="w-4 h-4 text-green-500" />
}

interface Props {
  initial: HealthStatus
}

export function SystemHealthCard({ initial }: Props) {
  const [status, setStatus] = useState<HealthStatus>(initial)
  const [testing, setTesting] = useState(false)

  async function testConnections() {
    setTesting(true)
    try {
      const res = await fetch('/api/admin/health')
      if (res.ok) setStatus(await res.json())
    } finally {
      setTesting(false)
    }
  }

  const rows: Row[] = [
    {
      label: 'Google Calendar',
      configured: status.calendar.configured,
      working: status.calendar.configured ? status.calendar.working : undefined,
      error: status.calendar.error,
    },
    { label: 'Twilio SMS', configured: status.twilio.configured },
    { label: 'Email (Resend)', configured: status.email.configured },
  ]

  return (
    <div className="space-y-3">
      {rows.map((row) => (
        <div key={row.label} className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <StatusDot configured={row.configured} working={row.working} />
            <div className="min-w-0">
              <p className="text-sm text-foreground">{row.label}</p>
              {row.error && (
                <p className="text-xs text-amber-600 dark:text-amber-400 font-mono break-all mt-0.5">{row.error}</p>
              )}
            </div>
          </div>
          <span className={cn(
            'text-xs shrink-0',
            !row.configured ? 'text-muted-foreground' :
            row.working === false ? 'text-amber-600 dark:text-amber-400' :
            'text-green-600 dark:text-green-400'
          )}>
            {!row.configured ? 'Not configured' :
             row.working === false ? 'Auth error' :
             'Active'}
          </span>
        </div>
      ))}

      <Button variant="outline" size="sm" onClick={testConnections} disabled={testing} className="mt-2 w-full">
        {testing
          ? <><Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" /> Testing…</>
          : <><RefreshCw className="w-3.5 h-3.5 mr-2" /> Test connections</>
        }
      </Button>
    </div>
  )
}
