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
  const [commissionType, setCommissionType] = useState<'flat' | 'percentage'>('flat')

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)

    const form = e.currentTarget
    const data = {
      name: (form.elements.namedItem('name') as HTMLInputElement).value.trim(),
      email: (form.elements.namedItem('email') as HTMLInputElement).value.trim(),
      commission_type: commissionType,
      commission_value: (form.elements.namedItem('commission') as HTMLInputElement).value,
      google_calendar_id: (form.elements.namedItem('calendar') as HTMLInputElement).value.trim() || null,
      business_name: (form.elements.namedItem('business_name') as HTMLInputElement).value.trim() || null,
      business_address: (form.elements.namedItem('business_address') as HTMLTextAreaElement).value.trim() || null,
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
            <Label htmlFor="business_name">Business name for emails</Label>
            <Input
              id="business_name"
              name="business_name"
              placeholder="e.g. Smith Plumbing Ltd (shown in email footers)"
              disabled={loading}
            />
            <p className="text-xs text-muted-foreground">
              The legal business name shown in every outgoing email footer. Defaults to the name above if left blank.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="business_address">Business address *</Label>
            <Textarea
              id="business_address"
              name="business_address"
              placeholder="e.g. 12 High Street, London, EC1A 1BB"
              rows={2}
              disabled={loading}
              className="resize-none"
            />
            <p className="text-xs text-muted-foreground">
              Required for CAN-SPAM / GDPR legal compliance — included in every email footer.
            </p>
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
            <Label>Commission type *</Label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setCommissionType('flat')}
                disabled={loading}
                className={`flex-1 rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
                  commissionType === 'flat'
                    ? 'border-foreground bg-foreground text-background'
                    : 'border-border bg-background text-foreground hover:bg-muted'
                }`}
              >
                Flat fee ($)
              </button>
              <button
                type="button"
                onClick={() => setCommissionType('percentage')}
                disabled={loading}
                className={`flex-1 rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
                  commissionType === 'percentage'
                    ? 'border-foreground bg-foreground text-background'
                    : 'border-border bg-background text-foreground hover:bg-muted'
                }`}
              >
                Percentage (%)
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="commission">
              Commission per completed job ({commissionType === 'flat' ? '$' : '%'}) *
            </Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                {commissionType === 'flat' ? '$' : '%'}
              </span>
              <Input
                id="commission"
                name="commission"
                type="number"
                min="0"
                step={commissionType === 'flat' ? '0.01' : '0.1'}
                max={commissionType === 'percentage' ? '100' : undefined}
                placeholder={commissionType === 'flat' ? '25.00' : '10'}
                required
                disabled={loading}
                className="pl-7"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              {commissionType === 'flat'
                ? 'Fixed dollar amount per completed job.'
                : 'Percentage of job value reported at completion.'}
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
