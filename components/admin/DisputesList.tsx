'use client'

import { useState } from 'react'
import { format, parseISO } from 'date-fns'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
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
import Link from 'next/link'
import { CheckCircle, XCircle, Loader2, AlertCircle, Pencil } from 'lucide-react'

interface DisputeRow {
  id: string
  booking_id: string
  client_id: string
  reason: string
  created_at: string
  clientName: string
  scheduledAt: string
  commissionOwed: number
  leadName: string
}

interface DisputesListProps {
  disputes: DisputeRow[]
}

export function DisputesList({ disputes: initialDisputes }: DisputesListProps) {
  const [disputes, setDisputes] = useState(initialDisputes)
  const [resolved, setResolved] = useState<Record<string, 'resolved' | 'rejected'>>({})
  const [target, setTarget] = useState<DisputeRow | null>(null)
  const [resolveStatus, setResolveStatus] = useState<'resolved' | 'rejected'>('rejected')
  const [adminNotes, setAdminNotes] = useState('')
  const [saving, setSaving] = useState(false)

  function openDialog(dispute: DisputeRow, status: 'resolved' | 'rejected') {
    setTarget(dispute)
    setResolveStatus(status)
    setAdminNotes('')
  }

  async function handleResolve() {
    if (!target) return
    setSaving(true)
    try {
      const res = await fetch(`/api/disputes/${target.id}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: resolveStatus, admin_notes: adminNotes.trim() || undefined }),
      })
      const json = await res.json()
      if (!res.ok) {
        toast.error(json.error ?? 'Failed to resolve dispute')
        return
      }
      toast.success(
        resolveStatus === 'resolved'
          ? 'Dispute resolved — commission waived'
          : 'Dispute rejected — commission stands'
      )
      setResolved((prev) => ({ ...prev, [target.id]: resolveStatus }))
      setTarget(null)
    } catch {
      toast.error('Something went wrong')
    } finally {
      setSaving(false)
    }
  }

  if (disputes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 border border-dashed border-border rounded-lg text-center">
        <CheckCircle className="w-7 h-7 text-green-500/40 mb-2" />
        <p className="text-sm text-muted-foreground">No open disputes</p>
      </div>
    )
  }

  return (
    <>
      <div className="rounded-lg border border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30">
              <TableHead className="font-medium">Client</TableHead>
              <TableHead className="font-medium">Lead</TableHead>
              <TableHead className="font-medium">Appointment</TableHead>
              <TableHead className="font-medium">Commission</TableHead>
              <TableHead className="font-medium">Dispute reason</TableHead>
              <TableHead className="font-medium">Raised</TableHead>
              <TableHead className="w-44" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {disputes.map((dispute) => (
              <TableRow key={dispute.id} className="hover:bg-muted/10">
                <TableCell className="font-medium">
                  <Link href={`/admin/clients/${dispute.client_id}`} className="text-foreground hover:text-primary transition-colors">
                    {dispute.clientName}
                  </Link>
                </TableCell>
                <TableCell className="text-muted-foreground">{dispute.leadName}</TableCell>
                <TableCell className="text-muted-foreground text-sm">
                  {format(parseISO(dispute.scheduledAt), 'dd MMM yyyy')}
                </TableCell>
                <TableCell className="font-mono text-sm">
                  ${(dispute.commissionOwed / 100).toFixed(2)}
                </TableCell>
                <TableCell className="text-sm text-foreground max-w-xs">
                  <p className="truncate">{dispute.reason}</p>
                </TableCell>
                <TableCell className="text-muted-foreground text-sm">
                  {format(parseISO(dispute.created_at), 'dd MMM yyyy')}
                </TableCell>
                <TableCell>
                  {resolved[dispute.id] ? (
                    <div className="flex items-center gap-2">
                      {resolved[dispute.id] === 'resolved' ? (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-green-600 bg-green-500/10 px-2 py-0.5 rounded-full">
                          <CheckCircle className="w-3 h-3" /> Upheld
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-destructive bg-destructive/10 px-2 py-0.5 rounded-full">
                          <XCircle className="w-3 h-3" /> Rejected
                        </span>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-muted-foreground hover:text-foreground"
                        onClick={() => openDialog(dispute, resolved[dispute.id]!)}
                      >
                        <Pencil className="w-3 h-3 mr-1" />
                        Edit
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-green-600 border-green-500/30 hover:bg-green-500/10"
                        onClick={() => openDialog(dispute, 'resolved')}
                      >
                        <CheckCircle className="w-3 h-3 mr-1.5" />
                        Uphold
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-destructive border-destructive/30 hover:bg-destructive/10"
                        onClick={() => openDialog(dispute, 'rejected')}
                      >
                        <XCircle className="w-3 h-3 mr-1.5" />
                        Reject
                      </Button>
                    </div>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Resolve dialog */}
      <Dialog open={target !== null} onOpenChange={(open) => !open && setTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-2">
              {resolveStatus === 'resolved' ? (
                <CheckCircle className="w-5 h-5 text-green-500" />
              ) : (
                <AlertCircle className="w-5 h-5 text-destructive" />
              )}
              <DialogTitle>
                {target && resolved[target.id] ? 'Edit decision' : resolveStatus === 'resolved' ? 'Uphold dispute' : 'Reject dispute'}
              </DialogTitle>
            </div>
            <DialogDescription>
              {resolveStatus === 'resolved'
                ? 'Commission will be waived (set to $0). The booking stays marked as disputed.'
                : 'Commission stands. The booking reverts to completed.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {target && resolved[target.id] && (
              <div className="space-y-1.5">
                <Label>Decision</Label>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    type="button"
                    variant={resolveStatus === 'resolved' ? 'default' : 'outline'}
                    className={resolveStatus !== 'resolved' ? 'text-muted-foreground' : ''}
                    onClick={() => setResolveStatus('resolved')}
                    disabled={saving}
                  >
                    <CheckCircle className="w-3.5 h-3.5 mr-1.5" />
                    Uphold
                  </Button>
                  <Button
                    size="sm"
                    type="button"
                    variant={resolveStatus === 'rejected' ? 'destructive' : 'outline'}
                    className={resolveStatus !== 'rejected' ? 'text-muted-foreground' : ''}
                    onClick={() => setResolveStatus('rejected')}
                    disabled={saving}
                  >
                    <XCircle className="w-3.5 h-3.5 mr-1.5" />
                    Reject
                  </Button>
                </div>
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="admin-notes">Admin notes (optional)</Label>
              <Textarea
                id="admin-notes"
                value={adminNotes}
                onChange={(e) => setAdminNotes(e.target.value)}
                placeholder="Reason for this decision…"
                rows={3}
                disabled={saving}
                className="resize-none"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTarget(null)} disabled={saving}>
              Cancel
            </Button>
            <Button
              variant={resolveStatus === 'resolved' ? 'default' : 'destructive'}
              onClick={handleResolve}
              disabled={saving}
            >
              {saving && <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />}
              {target && resolved[target.id]
                ? 'Save changes'
                : resolveStatus === 'resolved' ? 'Uphold & waive' : 'Reject dispute'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
