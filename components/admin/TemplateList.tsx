'use client'

import { useState } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { toast } from 'sonner'
import { CampaignTemplate } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { TemplateFormDialog } from '@/components/admin/TemplateFormDialog'
import { Pencil, Trash2, Plus, FileText, Loader2 } from 'lucide-react'

const CHANNEL_LABELS: Record<string, string> = {
  email: 'Email',
  sms: 'SMS',
  both: 'Email + SMS',
}

const TONE_LABELS: Record<string, string> = {
  professional: 'Professional',
  friendly: 'Friendly',
  casual: 'Casual',
  empathetic: 'Empathetic',
  direct: 'Direct',
  authoritative: 'Authoritative',
  playful: 'Playful',
  sincere: 'Sincere',
  nostalgic: 'Nostalgic',
  consultative: 'Consultative',
}

interface TemplateListProps {
  initialTemplates: CampaignTemplate[]
}

export function TemplateList({ initialTemplates }: TemplateListProps) {
  const [templates, setTemplates] = useState<CampaignTemplate[]>(initialTemplates)
  const [formOpen, setFormOpen] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState<CampaignTemplate | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<CampaignTemplate | null>(null)
  const [deleting, setDeleting] = useState(false)

  function openCreate() {
    setEditingTemplate(null)
    setFormOpen(true)
  }

  function openEdit(template: CampaignTemplate) {
    setEditingTemplate(template)
    setFormOpen(true)
  }

  function handleSaved(saved: CampaignTemplate) {
    setTemplates((prev) => {
      const exists = prev.find((t) => t.id === saved.id)
      if (exists) {
        return prev.map((t) => (t.id === saved.id ? saved : t))
      }
      return [saved, ...prev]
    })
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/campaigns/templates/${deleteTarget.id}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const json = await res.json()
        toast.error(json.error ?? 'Failed to delete template')
        return
      }
      setTemplates((prev) => prev.filter((t) => t.id !== deleteTarget.id))
      toast.success('Template deleted')
      setDeleteTarget(null)
    } catch {
      toast.error('Something went wrong')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Templates</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {templates.length} template{templates.length !== 1 ? 's' : ''} saved
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="w-4 h-4 mr-2" />
          New template
        </Button>
      </div>

      {/* Table or empty state */}
      {templates.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 border border-dashed border-border rounded-lg text-center">
          <FileText className="w-8 h-8 text-muted-foreground/40 mb-3" />
          <p className="text-sm font-medium text-foreground">No templates yet</p>
          <p className="text-xs text-muted-foreground mt-1">
            Save a campaign configuration as a reusable template.
          </p>
          <Button className="mt-4" onClick={openCreate}>
            <Plus className="w-4 h-4 mr-2" />
            Create first template
          </Button>
        </div>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30">
                <TableHead className="font-medium">Name</TableHead>
                <TableHead className="font-medium">Channel</TableHead>
                <TableHead className="font-medium">Tone</TableHead>
                <TableHead className="font-medium">Custom instructions</TableHead>
                <TableHead className="font-medium">Created</TableHead>
                <TableHead className="w-20" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {templates.map((template) => (
                <TableRow key={template.id} className="hover:bg-muted/20 transition-colors">
                  <TableCell className="font-medium text-foreground">
                    {template.name}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="text-xs">
                      {CHANNEL_LABELS[template.channel] ?? template.channel}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div>
                      <span className="text-sm text-foreground">
                        {TONE_LABELS[template.tone_preset] ?? template.tone_preset}
                      </span>
                      {template.tone_custom && (
                        <p className="text-xs text-muted-foreground truncate max-w-40">
                          {template.tone_custom}
                        </p>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm max-w-xs">
                    {template.custom_instructions ? (
                      <span className="truncate block max-w-48">{template.custom_instructions}</span>
                    ) : (
                      <span className="text-muted-foreground/50">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {formatDistanceToNow(new Date(template.created_at), { addSuffix: true })}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => openEdit(template)}
                        title="Edit"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => setDeleteTarget(template)}
                        title="Delete"
                        className="text-destructive hover:text-destructive hover:bg-destructive/10"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Create / Edit dialog */}
      <TemplateFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        template={editingTemplate}
        onSaved={handleSaved}
      />

      {/* Delete confirmation dialog */}
      <Dialog open={deleteTarget !== null} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete template</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &ldquo;{deleteTarget?.name}&rdquo;? This cannot be
              undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleting}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting && <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
