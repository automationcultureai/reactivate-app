interface StatCardProps {
  label: string
  value: string
  sub?: string
}

function StatCard({ label, value, sub }: StatCardProps) {
  return (
    <div className="p-4 rounded-lg border border-border bg-card">
      <p className="text-xs text-muted-foreground">{label}</p>
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
  emailsSent: number
  openedCount: number
  clickedCount: number
  bookedCount: number
  completedCount: number
}

export function DashboardStats({
  totalLeads,
  emailsSent,
  openedCount,
  clickedCount,
  bookedCount,
  completedCount,
}: DashboardStatsProps) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <StatCard
        label="Open rate"
        value={pct(openedCount, emailsSent)}
        sub={`${openedCount} of ${emailsSent} emails`}
      />
      <StatCard
        label="Click rate"
        value={pct(clickedCount, emailsSent)}
        sub={`${clickedCount} leads clicked`}
      />
      <StatCard
        label="Booking rate"
        value={pct(bookedCount + completedCount, totalLeads)}
        sub={`${bookedCount + completedCount} bookings total`}
      />
      <StatCard
        label="Completion rate"
        value={pct(completedCount, bookedCount + completedCount)}
        sub={`${completedCount} jobs completed`}
      />
    </div>
  )
}
