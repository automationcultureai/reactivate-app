'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Loader2, CheckCircle } from 'lucide-react'

interface MarkPaidButtonProps {
  clientId: string
  unpaidAmount: number   // in cents
}

export function MarkPaidButton({ clientId, unpaidAmount }: MarkPaidButtonProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  async function handleMarkPaid() {
    setLoading(true)
    try {
      const res = await fetch('/api/billing/mark-paid', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: clientId, paid: true }),
      })
      const json = await res.json()
      if (!res.ok) {
        toast.error(json.error ?? 'Failed to mark as paid')
        return
      }
      toast.success(`$${(unpaidAmount / 100).toFixed(2)} marked as paid`)
      router.refresh()
    } catch {
      toast.error('Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  if (unpaidAmount === 0) return null

  return (
    <Button
      size="sm"
      variant="outline"
      onClick={handleMarkPaid}
      disabled={loading}
      className="text-green-600 border-green-500/30 hover:bg-green-500/10"
    >
      {loading ? (
        <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
      ) : (
        <CheckCircle className="w-3.5 h-3.5 mr-1.5" />
      )}
      Mark ${(unpaidAmount / 100).toFixed(2)} as paid
    </Button>
  )
}
