interface AnalyticsCardProps {
  label: string
  value: string
  numerator: number
  denominator: number
}

function AnalyticsCard({ label, value, numerator, denominator }: AnalyticsCardProps) {
  return (
    <div className="p-4 rounded-lg border border-border bg-card space-y-1">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-2xl font-semibold text-foreground">{value}</p>
      <p className="text-xs text-muted-foreground">
        {numerator} of {denominator}
      </p>
    </div>
  )
}

function pct(num: number, denom: number): string {
  if (!denom) return '—'
  return `${Math.round((num / denom) * 100)}%`
}

interface CampaignAnalyticsProps {
  emailsSent: number     // emails with sent_at IS NOT NULL (Email 1 only = leads emailed)
  emailsOpened: number   // emails with opened_at IS NOT NULL (any sequence)
  leadCount: number      // total leads
  clickedCount: number   // leads with status clicked/booked/completed
  bookedCount: number    // leads with status booked/completed
  completedCount: number // leads with status completed
}

export function CampaignAnalytics({
  emailsSent,
  emailsOpened,
  leadCount,
  clickedCount,
  bookedCount,
  completedCount,
}: CampaignAnalyticsProps) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <AnalyticsCard
        label="Open rate"
        value={pct(emailsOpened, emailsSent)}
        numerator={emailsOpened}
        denominator={emailsSent}
      />
      <AnalyticsCard
        label="Click rate"
        value={pct(clickedCount, emailsSent)}
        numerator={clickedCount}
        denominator={emailsSent}
      />
      <AnalyticsCard
        label="Booking rate"
        value={pct(bookedCount, leadCount)}
        numerator={bookedCount}
        denominator={leadCount}
      />
      <AnalyticsCard
        label="Completion rate"
        value={pct(completedCount, bookedCount)}
        numerator={completedCount}
        denominator={bookedCount}
      />
    </div>
  )
}
