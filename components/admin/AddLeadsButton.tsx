'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { AddLeadsDialog } from '@/components/admin/AddLeadsDialog'
import { UserPlus } from 'lucide-react'

interface AddLeadsButtonProps {
  campaignId: string
  channel: 'email' | 'sms' | 'both'
}

export function AddLeadsButton({ campaignId, channel }: AddLeadsButtonProps) {
  const [open, setOpen] = useState(false)
  const router = useRouter()

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <UserPlus className="w-4 h-4 mr-2" />
        Add leads
      </Button>
      <AddLeadsDialog
        campaignId={campaignId}
        channel={channel}
        open={open}
        onOpenChange={setOpen}
        onAdded={() => router.refresh()}
      />
    </>
  )
}
