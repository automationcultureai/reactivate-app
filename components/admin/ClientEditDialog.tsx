'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Client } from '@/lib/supabase'
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
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    const commissionCents = Math.round(parseFloat(commissionDollars) * 100)
    if (isNaN(commissionCents) || commissionCents < 0) {
      toast.error('Commission must be a valid non-negative number')
      return
    }

    setSaving(true)
    try {
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
