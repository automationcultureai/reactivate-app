'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Loader2, Save } from 'lucide-react'

interface ClientNotesEditorProps {
  clientId: string
  initialNotes: string | null
}

export function ClientNotesEditor({ clientId, initialNotes }: ClientNotesEditorProps) {
  const [notes, setNotes] = useState(initialNotes ?? '')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  async function handleSave() {
    setSaving(true)
    setSaved(false)
    try {
      const res = await fetch(`/api/clients/${clientId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes }),
      })
      if (!res.ok) {
        const json = await res.json()
        toast.error(json.error ?? 'Failed to save notes')
        return
      }
      setSaved(true)
      toast.success('Notes saved')
    } catch {
      toast.error('Something went wrong')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-3">
      <Textarea
        value={notes}
        onChange={(e) => {
          setNotes(e.target.value)
          setSaved(false)
        }}
        placeholder="Commission arrangements, special instructions, relationship notes…"
        rows={5}
        disabled={saving}
        className="resize-none"
      />
      <Button
        size="sm"
        variant={saved ? 'outline' : 'default'}
        onClick={handleSave}
        disabled={saving}
      >
        {saving ? (
          <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />
        ) : (
          <Save className="w-3.5 h-3.5 mr-2" />
        )}
        {saving ? 'Saving…' : saved ? 'Saved' : 'Save notes'}
      </Button>
    </div>
  )
}
