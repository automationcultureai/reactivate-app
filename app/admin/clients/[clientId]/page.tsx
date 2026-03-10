import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getSupabaseClient } from '@/lib/supabase'
import { ClientDetailHeader } from '@/components/admin/ClientDetailHeader'
import { ClientNotesEditor } from '@/components/admin/ClientNotesEditor'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { buttonVariants } from '@/lib/button-variants'
import { ChevronLeft, FileText } from 'lucide-react'
import { Separator } from '@/components/ui/separator'

interface Props {
  params: Promise<{ clientId: string }>
}

export default async function ClientDetailPage({ params }: Props) {
  const { clientId } = await params
  const supabase = getSupabaseClient()

  const { data: client, error } = await supabase
    .from('clients')
    .select('*')
    .eq('id', clientId)
    .single()

  if (error || !client) {
    notFound()
  }

  // Fetch campaigns for this client
  const { data: campaigns } = await supabase
    .from('campaigns')
    .select('id, name, status, created_at, channel')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })

  return (
    <div className="space-y-8">
      {/* Back navigation */}
      <div className="flex items-center gap-2">
        <Link
          href="/admin/clients"
          className={cn(buttonVariants({ variant: 'ghost', size: 'icon' }))}
        >
          <ChevronLeft className="w-4 h-4" />
        </Link>
        <span className="text-sm text-muted-foreground">All clients</span>
      </div>

      {/* Client header */}
      <ClientDetailHeader client={client} />

      <Separator />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left column: campaigns */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-foreground">Campaigns</h2>
            <Link
              href={`/admin/clients/${clientId}/campaigns/new`}
              className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
            >
              New campaign
            </Link>
          </div>

          {!campaigns || campaigns.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 border border-dashed border-border rounded-lg text-center">
              <FileText className="w-8 h-8 text-muted-foreground/40 mb-3" />
              <p className="text-sm font-medium text-foreground">No campaigns yet</p>
              <p className="text-xs text-muted-foreground mt-1">
                Create a campaign to start sending reactivation messages.
              </p>
              <Link
                href={`/admin/clients/${clientId}/campaigns/new`}
                className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'mt-4')}
              >
                Create first campaign
              </Link>
            </div>
          ) : (
            <div className="space-y-2">
              {campaigns.map((campaign) => (
                <Link
                  key={campaign.id}
                  href={`/admin/clients/${clientId}/campaigns/${campaign.id}`}
                  className="flex items-center justify-between p-4 rounded-lg border border-border hover:bg-muted/20 transition-colors group"
                >
                  <div>
                    <p className="text-sm font-medium text-foreground group-hover:text-primary transition-colors">
                      {campaign.name}
                    </p>
                    <p className="text-xs text-muted-foreground capitalize">
                      {campaign.channel} · {campaign.status}
                    </p>
                  </div>
                  <ChevronLeft className="w-4 h-4 text-muted-foreground rotate-180" />
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Right column: notes */}
        <div>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Internal notes</CardTitle>
              <CardDescription>
                Admin only — never visible to the client.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ClientNotesEditor clientId={clientId} initialNotes={client.notes} />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
