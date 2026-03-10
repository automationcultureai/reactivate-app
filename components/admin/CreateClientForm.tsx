'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Loader2 } from 'lucide-react'

export function CreateClientForm() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)

    const form = e.currentTarget
    const data = {
      name: (form.elements.namedItem('name') as HTMLInputElement).value.trim(),
      email: (form.elements.namedItem('email') as HTMLInputElement).value.trim(),
      commission_dollars: (form.elements.namedItem('commission') as HTMLInputElement).value,
      google_calendar_id: (form.elements.namedItem('calendar') as HTMLInputElement).value.trim() || null,
      notes: (form.elements.namedItem('notes') as HTMLTextAreaElement).value.trim() || null,
    }

    try {
      const res = await fetch('/api/clients/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })

      const json = await res.json()

      if (!res.ok) {
        toast.error(json.error ?? 'Failed to create client')
        return
      }

      toast.success(`Client "${data.name}" created successfully`)
      router.push(`/admin/clients/${json.client.id}`)
      router.refresh()
    } catch {
      toast.error('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl">
      <Card>
        <CardHeader>
          <CardTitle>Business details</CardTitle>
          <CardDescription>
            Basic information about the client business.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Business name *</Label>
            <Input
              id="name"
              name="name"
              placeholder="e.g. Smith Plumbing Ltd"
              required
              disabled={loading}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Contact email *</Label>
            <Input
              id="email"
              name="email"
              type="email"
              placeholder="e.g. hello@smithplumbing.co.uk"
              required
              disabled={loading}
            />
            <p className="text-xs text-muted-foreground">
              Lead replies and notifications are sent to this address.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="commission">Commission per completed job ($) *</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                $
              </span>
              <Input
                id="commission"
                name="commission"
                type="number"
                min="0"
                step="0.01"
                placeholder="25.00"
                required
                disabled={loading}
                className="pl-7"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Flat fee charged per job marked as complete.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Integrations</CardTitle>
          <CardDescription>
            Connect the client&apos;s Google Calendar for booking availability.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="calendar">Google Calendar ID</Label>
            <Input
              id="calendar"
              name="calendar"
              placeholder="e.g. primary or abc123@group.calendar.google.com"
              disabled={loading}
            />
            <p className="text-xs text-muted-foreground">
              Found in Google Calendar settings → Integrate calendar.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Internal notes</CardTitle>
          <CardDescription>
            Private notes only visible to admins — never shown to the client.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea
            id="notes"
            name="notes"
            placeholder="Commission arrangements, special instructions, relationship notes…"
            rows={4}
            disabled={loading}
          />
        </CardContent>
      </Card>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={loading}>
          {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
          Create client
        </Button>
        <Button type="button" variant="outline" onClick={() => router.back()} disabled={loading}>
          Cancel
        </Button>
      </div>
    </form>
  )
}
