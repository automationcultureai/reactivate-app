'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Lead } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Loader2 } from 'lucide-react'

interface LeadEditDialogProps {
  lead: Lead
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: (updated: Lead) => void
}

export function LeadEditDialog({ lead, open, onOpenChange, onSaved }: LeadEditDialogProps) {
  const [name, setName] = useState(lead.name)
  const [email, setEmail] = useState(lead.email ?? '')
  const [phone, setPhone] = useState(lead.phone ?? '')
  const [lastContactDate, setLastContactDate] = useState(lead.last_contact_date ?? '')
  const [serviceType, setServiceType] = useState(lead.service_type ?? '')
  const [purchaseValue, setPurchaseValue] = useState(lead.purchase_value ?? '')
  const [notes, setNotes] = useState(lead.notes ?? '')
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    setSaving(true)
    try {
      const res = await fetch(`/api/leads/${lead.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim() || undefined,
          email: email.trim() || null,
          phone: phone.trim() || null,
          last_contact_date: lastContactDate.trim() || null,
          service_type: serviceType.trim() || null,
          purchase_value: purchaseValue.trim() || null,
          notes: notes.trim() || null,
        }),
      })
      const json = await res.json()
      if (!res.ok) {
        toast.error(json.error ?? 'Failed to update lead')
        return
      }
      toast.success('Lead updated')
      onSaved(json.lead as Lead)
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
          <DialogTitle>Edit lead</DialogTitle>
          <DialogDescription>Update the lead&apos;s contact and service details.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="lead-name">Name</Label>
            <Input
              id="lead-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Jane Smith"
              disabled={saving}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="lead-email">Email</Label>
              <Input
                id="lead-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="jane@example.com"
                disabled={saving}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lead-phone">Phone</Label>
              <Input
                id="lead-phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+44 7700 900000"
                disabled={saving}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="lead-last-contact">Last contact date</Label>
              <Input
                id="lead-last-contact"
                value={lastContactDate}
                onChange={(e) => setLastContactDate(e.target.value)}
                placeholder="Jan 2024"
                disabled={saving}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lead-service">Service type</Label>
              <Input
                id="lead-service"
                value={serviceType}
                onChange={(e) => setServiceType(e.target.value)}
                placeholder="Boiler service"
                disabled={saving}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="lead-purchase-value">Purchase value</Label>
            <Input
              id="lead-purchase-value"
              value={purchaseValue}
              onChange={(e) => setPurchaseValue(e.target.value)}
              placeholder="£350"
              disabled={saving}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="lead-notes">Notes</Label>
            <Textarea
              id="lead-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any relevant notes…"
              disabled={saving}
              rows={3}
              className="resize-none"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || !name.trim()}>
            {saving && <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />}
            Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
