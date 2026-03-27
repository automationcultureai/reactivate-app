'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Client, AvailabilityHours, DEFAULT_AVAILABILITY } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

const TIMEZONES = [
  { value: 'Australia/Sydney',    label: 'Sydney / Melbourne (AEST/AEDT)' },
  { value: 'Australia/Brisbane',  label: 'Brisbane (AEST)' },
  { value: 'Australia/Adelaide',  label: 'Adelaide (ACST/ACDT)' },
  { value: 'Australia/Perth',     label: 'Perth (AWST)' },
  { value: 'Australia/Darwin',    label: 'Darwin (ACST)' },
  { value: 'Pacific/Auckland',    label: 'Auckland (NZST/NZDT)' },
  { value: 'Pacific/Auckland',    label: 'Auckland (NZST/NZDT)' },
  { value: 'America/New_York',    label: 'New York (ET)' },
  { value: 'America/Chicago',     label: 'Chicago (CT)' },
  { value: 'America/Los_Angeles', label: 'Los Angeles (PT)' },
  { value: 'Europe/London',       label: 'London (GMT/BST)' },
]

const DAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
const DAY_FULL   = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

interface ClientEditDialogProps {
  client: Client
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: (updated: Client) => void
}

export function ClientEditDialog({ client, open, onOpenChange, onSaved }: ClientEditDialogProps) {
  const [name, setName] = useState(client.name)
  const [email, setEmail] = useState(client.email)
  // Store commission in dollars for the UI; API expects cents
  const [commissionDollars, setCommissionDollars] = useState(
    (client.commission_per_job / 100).toFixed(2)
  )
  const [googleCalendarId, setGoogleCalendarId] = useState(client.google_calendar_id ?? '')
  const [businessName, setBusinessName] = useState(client.business_name ?? '')
  const [businessAddress, setBusinessAddress] = useState(client.business_address ?? '')
  const avail = client.availability_hours ?? DEFAULT_AVAILABILITY
  const [availTimezone, setAvailTimezone] = useState(avail.timezone)
  const [availDays, setAvailDays] = useState<number[]>(avail.days)
  const [availStartHour, setAvailStartHour] = useState(String(avail.start_hour))
  const [availEndHour, setAvailEndHour] = useState(String(avail.end_hour))
  const [saving, setSaving] = useState(false)

  function toggleDay(d: number) {
    setAvailDays((prev) =>
      prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort()
    )
  }

  async function handleSave() {
    const commissionCents = Math.round(parseFloat(commissionDollars) * 100)
    if (isNaN(commissionCents) || commissionCents < 0) {
      toast.error('Commission must be a valid non-negative number')
      return
    }

    setSaving(true)
    try {
      const startH = parseInt(availStartHour)
      const endH = parseInt(availEndHour)
      if (isNaN(startH) || isNaN(endH) || startH < 0 || endH > 23 || startH >= endH) {
        toast.error('Availability hours: start must be before end (0–23)')
        setSaving(false)
        return
      }
      const availability_hours: AvailabilityHours = {
        timezone: availTimezone,
        days: availDays,
        start_hour: startH,
        end_hour: endH,
      }

      const res = await fetch(`/api/clients/${client.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          commission_per_job: commissionCents,
          google_calendar_id: googleCalendarId.trim() || null,
          business_name: businessName.trim() || null,
          business_address: businessAddress.trim() || null,
          availability_hours,
        }),
      })
      const json = await res.json()
      if (!res.ok) {
        toast.error(json.error ?? 'Failed to update client')
        return
      }
      toast.success('Client updated')
      onSaved(json.client as Client)
      onOpenChange(false)
    } catch {
      toast.error('Something went wrong')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit client</DialogTitle>
          <DialogDescription>Update the client&apos;s account details.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="client-name">Name</Label>
            <Input
              id="client-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Jane Smith"
              disabled={saving}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="client-email">Email</Label>
            <Input
              id="client-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="jane@example.com"
              disabled={saving}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="client-commission">Commission per completed job ($)</Label>
            <Input
              id="client-commission"
              type="number"
              min="0"
              step="0.01"
              value={commissionDollars}
              onChange={(e) => setCommissionDollars(e.target.value)}
              placeholder="25.00"
              disabled={saving}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="client-calendar">Google Calendar ID</Label>
            <Input
              id="client-calendar"
              value={googleCalendarId}
              onChange={(e) => setGoogleCalendarId(e.target.value)}
              placeholder="example@group.calendar.google.com"
              disabled={saving}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="client-biz-name">Business name</Label>
            <Input
              id="client-biz-name"
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              placeholder="Acme Plumbing Ltd"
              disabled={saving}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="client-biz-address">Business address</Label>
            <Input
              id="client-biz-address"
              value={businessAddress}
              onChange={(e) => setBusinessAddress(e.target.value)}
              placeholder="123 Main St, City, Postcode"
              disabled={saving}
            />
          </div>

          {/* Booking availability */}
          <div className="space-y-3 pt-2 border-t border-border">
            <p className="text-sm font-medium text-foreground">Booking availability</p>

            <div className="space-y-1.5">
              <Label htmlFor="client-tz">Timezone</Label>
              <select
                id="client-tz"
                value={availTimezone}
                onChange={(e) => setAvailTimezone(e.target.value)}
                disabled={saving}
                className="w-full h-9 rounded-md border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              >
                {TIMEZONES.map((tz) => (
                  <option key={tz.value + tz.label} value={tz.value}>{tz.label}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <Label>Available days</Label>
              <div className="flex gap-1">
                {DAY_LABELS.map((label, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => toggleDay(i)}
                    disabled={saving}
                    title={DAY_FULL[i]}
                    className={cn(
                      'w-8 h-8 rounded text-xs font-medium transition-colors',
                      availDays.includes(i)
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted text-muted-foreground hover:bg-muted/80'
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="client-start-hour">Opens (hour, 0–23)</Label>
                <Input
                  id="client-start-hour"
                  type="number"
                  min={0}
                  max={22}
                  value={availStartHour}
                  onChange={(e) => setAvailStartHour(e.target.value)}
                  placeholder="9"
                  disabled={saving}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="client-end-hour">Closes (hour, 0–23)</Label>
                <Input
                  id="client-end-hour"
                  type="number"
                  min={1}
                  max={23}
                  value={availEndHour}
                  onChange={(e) => setAvailEndHour(e.target.value)}
                  placeholder="17"
                  disabled={saving}
                />
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || !name.trim() || !email.trim()}>
            {saving && <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />}
            Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
