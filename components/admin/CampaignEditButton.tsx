'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { CampaignEditDialog } from '@/components/admin/CampaignEditDialog'
import { Pencil, Trash2, Loader2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'

interface Campaign {
  id: string
  name: string
  channel: string
  tone_preset: string
  tone_custom: string | null
  custom_instructions: string | null
  notify_client: boolean
  send_booking_confirmation: boolean
  send_booking_reminder: boolean
  status: string
}

export function CampaignEditButton({ campaign, clientId }: { campaign: Campaign; clientId?: string }) {
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const router = useRouter()

  async function handleDelete() {
    setDeleting(true)
    try {
      const res = await fetch(`/api/campaigns/${campaign.id}/delete`, { method: 'POST' })
      if (!res.ok) {
        const json = await res.json()
        toast.error(json.error ?? 'Failed to delete campaign')
        return
      }
      toast.success('Campaign archived')
      setDeleteOpen(false)
      if (clientId) {
        router.push(`/admin/clients/${clientId}`)
      } else {
        router.refresh()
      }
    } catch {
      toast.error('Something went wrong')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
        <Pencil className="w-3.5 h-3.5 mr-1.5" />
        Edit
      </Button>
      <Button variant="outline" size="sm" onClick={() => setDeleteOpen(true)} className="text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/30">
        <Trash2 className="w-3.5 h-3.5 mr-1.5" />
        Archive
      </Button>

      <CampaignEditDialog
        campaign={campaign as Parameters<typeof CampaignEditDialog>[0]['campaign']}
        open={editOpen}
        onOpenChange={setEditOpen}
      />

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Archive campaign?</DialogTitle>
            <DialogDescription>
              <strong>{campaign.name}</strong> will be archived and all sends will stop. Leads and bookings are preserved. You can view archived campaigns from the client page.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)} disabled={deleting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting && <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />}
              Archive campaign
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
