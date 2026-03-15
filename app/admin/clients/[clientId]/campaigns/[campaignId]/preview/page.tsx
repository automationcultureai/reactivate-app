import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { getSupabaseClient } from '@/lib/supabase'
import { PreviewList, LeadPreviewData } from '@/components/admin/PreviewList'
import { cn } from '@/lib/utils'
import { buttonVariants } from '@/lib/button-variants'
import { ChevronLeft, Eye } from 'lucide-react'
import type { Lead, Email, SmsMessage, CampaignAbTest } from '@/lib/supabase'

interface Props {
  params: Promise<{ clientId: string; campaignId: string }>
}

export default async function PreviewPage({ params }: Props) {
  const { clientId, campaignId } = await params
  const supabase = getSupabaseClient()

  // Fetch campaign
  const { data: campaign, error } = await supabase
    .from('campaigns')
    .select('*')
    .eq('id', campaignId)
    .eq('client_id', clientId)
    .single()

  if (error || !campaign) notFound()

  // Only "ready" campaigns can be previewed
  if (campaign.status !== 'ready') {
    redirect(`/admin/clients/${clientId}/campaigns/${campaignId}`)
  }

  const { data: client } = await supabase
    .from('clients')
    .select('name')
    .eq('id', clientId)
    .single()

  // Fetch all leads for this campaign
  const { data: leads } = await supabase
    .from('leads')
    .select('*')
    .eq('campaign_id', campaignId)
    .not('status', 'in', '(deleted)')
    .order('created_at', { ascending: true })

  if (!leads || leads.length === 0) {
    return (
      <div className="text-center py-16">
        <p className="text-muted-foreground">No leads found for this campaign.</p>
      </div>
    )
  }

  const leadIds = leads.map((l) => l.id)

  // Fetch all emails for these leads
  const { data: emails } = await supabase
    .from('emails')
    .select('*')
    .in('lead_id', leadIds)
    .order('sequence_number', { ascending: true })

  // Fetch all SMS for these leads (only if channel includes SMS)
  const hasSms = campaign.channel === 'sms' || campaign.channel === 'both'
  const { data: smsList } = hasSms
    ? await supabase
        .from('sms_messages')
        .select('*')
        .in('lead_id', leadIds)
        .order('sequence_number', { ascending: true })
    : { data: [] as SmsMessage[] }

  // Fetch A/B test config for this campaign
  const { data: abTests } = await supabase
    .from('campaign_ab_tests')
    .select('*')
    .eq('campaign_id', campaignId)

  // Group emails + SMS by lead_id
  const emailsByLead = new Map<string, Email[]>()
  const smsByLead = new Map<string, SmsMessage[]>()

  for (const email of emails ?? []) {
    if (!emailsByLead.has(email.lead_id)) emailsByLead.set(email.lead_id, [])
    emailsByLead.get(email.lead_id)!.push(email)
  }

  for (const sms of smsList ?? []) {
    if (!smsByLead.has(sms.lead_id)) smsByLead.set(sms.lead_id, [])
    smsByLead.get(sms.lead_id)!.push(sms)
  }

  const leadPreviews: LeadPreviewData[] = (leads as Lead[]).map((lead) => ({
    lead,
    emails: emailsByLead.get(lead.id) ?? [],
    sms: smsByLead.get(lead.id) ?? [],
  }))

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2">
        <Link
          href={`/admin/clients/${clientId}/campaigns/${campaignId}`}
          className={cn(buttonVariants({ variant: 'ghost', size: 'icon' }))}
        >
          <ChevronLeft className="w-4 h-4" />
        </Link>
        <div>
          <div className="flex items-center gap-2">
            <Eye className="w-4 h-4 text-muted-foreground" />
            <h1 className="text-2xl font-semibold text-foreground">Preview &amp; approve</h1>
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">
            <span className="font-medium text-foreground">{campaign.name}</span>
            {client && <> · {client.name}</>}
            {' '}· {leads.length} lead{leads.length !== 1 ? 's' : ''}
          </p>
        </div>
      </div>

      {/* Preview list */}
      <PreviewList
        campaignId={campaignId}
        clientId={clientId}
        channel={campaign.channel as 'email' | 'sms' | 'both'}
        leads={leadPreviews}
        initialAbTests={(abTests ?? []) as CampaignAbTest[]}
      />
    </div>
  )
}
