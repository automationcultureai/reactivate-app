'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { CampaignEditDialog } from '@/components/admin/CampaignEditDialog'
import { Pencil } from 'lucide-react'

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

export function CampaignEditButton({ campaign }: { campaign: Campaign }) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Pencil className="w-3.5 h-3.5 mr-1.5" />
        Edit
      </Button>
      <CampaignEditDialog
        campaign={campaign as Parameters<typeof CampaignEditDialog>[0]['campaign']}
        open={open}
        onOpenChange={setOpen}
      />
    </>
  )
}
