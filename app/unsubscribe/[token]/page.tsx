import { getSupabaseClient } from '@/lib/supabase'
import { CheckCircle, AlertCircle, Zap } from 'lucide-react'

interface Props {
  params: Promise<{ token: string }>
}

export default async function UnsubscribePage({ params }: Props) {
  const { token } = await params
  const supabase = getSupabaseClient()

  // Fetch lead by booking_token — join to get client business name
  const { data: lead } = await supabase
    .from('leads')
    .select('id, email_opt_out, status, client_id, clients(business_name, name)')
    .eq('booking_token', token)
    .single()

  const clientRecord = lead?.clients as unknown as { business_name: string | null; name: string } | null
  const clientName = clientRecord?.business_name || clientRecord?.name || 'the business'

  let alreadyUnsubscribed = false
  let success = false

  if (!lead) {
    // Token invalid — show generic confirmation to avoid info leakage
    return <UnsubscribeLayout status="invalid" clientName={clientName} />
  }

  if (lead.email_opt_out) {
    alreadyUnsubscribed = true
    success = true
  } else {
    // Process the unsubscribe server-side
    const { error: updateError } = await supabase
      .from('leads')
      .update({ email_opt_out: true, status: 'unsubscribed' })
      .eq('id', lead.id)

    if (!updateError) {
      // Log the event
      await supabase.from('lead_events').insert({
        lead_id: lead.id,
        event_type: 'unsubscribed',
        description: 'Lead unsubscribed via email link',
      })
      success = true
    }
  }

  if (!success) {
    return <UnsubscribeLayout status="error" clientName={clientName} />
  }

  return (
    <UnsubscribeLayout
      status={alreadyUnsubscribed ? 'already' : 'success'}
      clientName={clientName}
    />
  )
}

// ============================================================
// Presentation component — stateless
// ============================================================

type UnsubscribeStatus = 'success' | 'already' | 'invalid' | 'error'

function UnsubscribeLayout({
  status,
  clientName,
}: {
  status: UnsubscribeStatus
  clientName: string
}) {
  const isSuccess = status === 'success' || status === 'already'

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4">
      {/* Brand mark */}
      <div className="flex items-center gap-2 mb-12 text-muted-foreground/50">
        <Zap className="w-4 h-4" />
        <span className="text-sm font-medium">Reactivate</span>
      </div>

      <div className="max-w-md w-full text-center space-y-6">
        {/* Icon */}
        <div className="flex justify-center">
          {isSuccess ? (
            <div className="flex items-center justify-center w-16 h-16 rounded-full bg-green-500/10">
              <CheckCircle className="w-8 h-8 text-green-500" />
            </div>
          ) : (
            <div className="flex items-center justify-center w-16 h-16 rounded-full bg-destructive/10">
              <AlertCircle className="w-8 h-8 text-destructive" />
            </div>
          )}
        </div>

        {/* Message */}
        {status === 'success' && (
          <>
            <div className="space-y-2">
              <h1 className="text-2xl font-semibold text-foreground">
                You&apos;ve been unsubscribed
              </h1>
              <p className="text-muted-foreground text-sm leading-relaxed">
                You will no longer receive emails from{' '}
                <span className="font-medium text-foreground">{clientName}</span>.
                This change is immediate.
              </p>
            </div>
            <p className="text-xs text-muted-foreground">
              If you unsubscribed by mistake, please contact{' '}
              <span className="font-medium">{clientName}</span> directly to opt back in.
            </p>
          </>
        )}

        {status === 'already' && (
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold text-foreground">
              Already unsubscribed
            </h1>
            <p className="text-muted-foreground text-sm">
              You&apos;ve already been removed from emails from{' '}
              <span className="font-medium text-foreground">{clientName}</span>.
              No further action is needed.
            </p>
          </div>
        )}

        {status === 'invalid' && (
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold text-foreground">
              Link not recognised
            </h1>
            <p className="text-muted-foreground text-sm">
              This unsubscribe link is invalid or has already been used.
              If you continue to receive emails you don&apos;t want, please reply
              directly to any email and request removal.
            </p>
          </div>
        )}

        {status === 'error' && (
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold text-foreground">
              Something went wrong
            </h1>
            <p className="text-muted-foreground text-sm">
              We couldn&apos;t process your unsubscribe request. Please try again or
              reply directly to any email to request removal.
            </p>
          </div>
        )}
      </div>

      {/* Legal footer */}
      <div className="mt-16 text-center">
        <p className="text-xs text-muted-foreground/50">
          Powered by Reactivate · Your data is handled in accordance with our{' '}
          <a href="/privacy" className="underline hover:text-muted-foreground transition-colors">
            privacy policy
          </a>
        </p>
      </div>
    </div>
  )
}
