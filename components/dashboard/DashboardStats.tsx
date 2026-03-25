import { Info } from 'lucide-react'

function StatCard({ label, value, sub, tooltip }: { label: string; value: string; sub?: string; tooltip: string }) {
  return (
    <div className="p-4 rounded-lg border border-border bg-card">
      <div className="flex items-start justify-between gap-1">
        <p className="text-xs text-muted-foreground">{label}</p>
        <div className="relative group">
          <Info className="w-3 h-3 text-muted-foreground/40 cursor-help" />
          <div className="absolute right-0 bottom-full mb-1.5 z-50 hidden group-hover:block w-64 rounded-md border border-border bg-popover p-2.5 text-xs text-popover-foreground shadow-md pointer-events-none">
            {tooltip}
          </div>
        </div>
      </div>
      <p className="text-2xl font-semibold text-foreground mt-1">{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  )
}

function pct(num: number, denom: number): string {
  if (!denom) return '—'
  return `${Math.round((num / denom) * 100)}%`
}

interface DashboardStatsProps {
  totalLeads: number
  bookedCount: number
  emailsSent: number
  openedCount: number
  clickedCount: number
  completedCount: number
  totalSpend: number   // in cents — sum of commission_owed for completed bookings
  smsSent: number
  smsOptedOut: number
  uniqueSmsLeads: number
  smsSeqCounts: { sms1: number; sms2: number; sms3: number; sms4: number }
}

export function DashboardStats({
  totalLeads,
  bookedCount,
  emailsSent,
  openedCount,
  clickedCount,
  completedCount,
  totalSpend,
  smsSent,
  smsOptedOut,
  uniqueSmsLeads,
  smsSeqCounts,
}: DashboardStatsProps) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
      <StatCard
        label="Total leads"
        value={String(totalLeads)}
        sub="across all campaigns"
        tooltip="Total number of leads uploaded across all campaigns for this client."
      />
      <StatCard
        label="Leads booked"
        value={String(bookedCount)}
        sub={`${completedCount} completed`}
        tooltip="Number of leads who have booked or completed an appointment."
      />
      <StatCard
        label="Email open rate"
        value={pct(openedCount, emailsSent)}
        sub={`${openedCount} of ${emailsSent} emails`}
        tooltip="Percentage of sent emails that were opened. Calculated as: emails opened ÷ emails sent. Note: Apple Mail Privacy Protection may inflate this figure."
      />
      <StatCard
        label="Click through rate"
        value={pct(clickedCount, emailsSent)}
        sub={`${clickedCount} leads clicked`}
        tooltip="Percentage of emailed leads who clicked the booking link. Calculated as: leads who clicked ÷ leads emailed."
      />
      <StatCard
        label="Booking rate"
        value={pct(bookedCount, totalLeads)}
        sub={`${bookedCount} of ${totalLeads} leads`}
        tooltip="Percentage of all leads who have booked an appointment. Calculated as: leads booked ÷ total leads."
      />
      <StatCard
        label="Jobs completed"
        value={String(completedCount)}
        sub={`${pct(completedCount, bookedCount)} completion rate`}
        tooltip="Number of booked appointments that were completed."
      />
      <StatCard
        label="Total spend"
        value={`$${(totalSpend / 100).toFixed(2)}`}
        sub="Commission charged for completed jobs"
        tooltip="Total commission charged by the agency for all completed jobs."
      />
      {smsSent > 0 && (
        <StatCard
          label="Leads reached by SMS"
          value={String(uniqueSmsLeads)}
          sub={smsOptedOut > 0 ? `${pct(smsOptedOut, uniqueSmsLeads)} opt-out rate` : 'no opt-outs'}
          tooltip="The number of leads who were contacted by SMS during this campaign."
        />
      )}
    </div>
  )
}
