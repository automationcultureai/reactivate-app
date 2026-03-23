'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Loader2, Zap } from 'lucide-react'

interface GenerateButtonProps {
  campaignId: string
  clientId: string
  leadCount: number
  label?: string  // Custom label for "generate for new leads" use case
}

const CHUNK_SIZE = 10  // leads per API call — keeps each Vercel invocation ~50s

export function GenerateButton({ campaignId, clientId, leadCount, label }: GenerateButtonProps) {
  const router = useRouter()
  const [generating, setGenerating] = useState(false)

  async function handleGenerate() {
    setGenerating(true)
    let processed = 0
    let total = leadCount
    const allFailedLeads: string[] = []
    const toastId = toast.loading(`Generating sequences… 0/${total}`)

    try {
      let lastJson: Record<string, unknown> = {}

      // Loop until the server reports no remaining leads
      while (true) {
        const res = await fetch(
          `/api/campaigns/${campaignId}/generate?limit=${CHUNK_SIZE}`,
          { method: 'POST' }
        )

        // If the server returned non-JSON (e.g. a 504 HTML page), surface it clearly
        let json: Record<string, unknown>
        try {
          json = await res.json()
        } catch {
          toast.error('Server error during generation — check Vercel logs.', { id: toastId })
          return
        }

        lastJson = json

        if (!res.ok) {
          toast.error((json.error as string) ?? 'Generation failed', { id: toastId })
          return
        }

        // Update totals with server-reported values
        if (typeof json.total === 'number') total = json.total
        processed += (json.generated as number ?? 0) + (json.failed as number ?? 0)
        allFailedLeads.push(...((json.failed_leads as string[]) ?? []))

        const remaining = json.remaining as number ?? 0

        if (remaining > 0) {
          toast.loading(`Generating sequences… ${processed}/${total}`, { id: toastId })
        } else {
          break
        }
      }

      // Done — show result
      if (allFailedLeads.length > 0) {
        const successCount = processed - allFailedLeads.length
        const errorDetail = (lastJson.first_error as string | undefined)
          ? ` — ${(lastJson.first_error as string).slice(0, 120)}`
          : ''
        toast.warning(
          `Generated ${successCount} lead${successCount !== 1 ? 's' : ''}. ${allFailedLeads.length} failed: ${allFailedLeads.slice(0, 3).join(', ')}${allFailedLeads.length > 3 ? '…' : ''}${errorDetail}`,
          { id: toastId, duration: 10000 }
        )
      } else if (processed === 0) {
        toast.success('All leads already have sequences generated.', { id: toastId })
      } else {
        toast.success(`${processed} sequence${processed !== 1 ? 's' : ''} generated successfully.`, { id: toastId })
      }

      // Only go to preview when the campaign just moved to ready (draft → ready transition)
      // For active/paused campaigns just refresh so the new sequences appear inline
      if (lastJson.status === 'ready') {
        router.push(`/admin/clients/${clientId}/campaigns/${campaignId}/preview`)
      }
      router.refresh()
    } catch {
      toast.error('Something went wrong during generation.', { id: toastId })
    } finally {
      setGenerating(false)
    }
  }

  const defaultLabel = label ?? 'Generate sequences'

  return (
    <Button onClick={handleGenerate} disabled={generating}>
      {generating ? (
        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
      ) : (
        <Zap className="w-4 h-4 mr-2" />
      )}
      {generating ? 'Generating…' : defaultLabel}
    </Button>
  )
}
