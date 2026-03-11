'use client'

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts'

interface FunnelData {
  totalLeads: number
  emailsSent: number
  clickedCount: number
  bookedCount: number
  completedCount: number
}

interface BookingsByMonth {
  month: string
  bookings: number
  completed: number
}

interface DashboardChartsProps {
  funnel: FunnelData
  bookingsByMonth: BookingsByMonth[]
}

const FUNNEL_COLOUR = 'hsl(221 83% 53%)'
const BAR_COLOUR = 'hsl(221 83% 53%)'
const BAR_COMPLETED = 'hsl(142 71% 45%)'

// Simple tooltip styles that work in both themes
function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: number; color: string }>; label?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-md">
      {label && <p className="font-medium text-foreground mb-1">{label}</p>}
      {payload.map((p) => (
        <p key={p.name} style={{ color: p.color }}>
          {p.name}: {p.value}
        </p>
      ))}
    </div>
  )
}

export function DashboardCharts({ funnel, bookingsByMonth }: DashboardChartsProps) {
  const funnelData = [
    { label: 'Total leads', value: funnel.totalLeads },
    { label: 'Emailed', value: funnel.emailsSent },
    { label: 'Clicked', value: funnel.clickedCount },
    { label: 'Booked', value: funnel.bookedCount },
    { label: 'Completed', value: funnel.completedCount },
  ]

  const maxFunnel = Math.max(...funnelData.map((d) => d.value), 1)

  return (
    <div className="space-y-8">
      {/* Lead funnel */}
      <div className="space-y-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Lead funnel</h3>
          <p className="text-xs text-muted-foreground">Leads progressing through each stage</p>
        </div>
        <div className="space-y-2">
          {funnelData.map((d) => (
            <div key={d.label} className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground w-20 shrink-0 text-right">{d.label}</span>
              <div className="flex-1 bg-muted/30 rounded-full h-5 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${(d.value / maxFunnel) * 100}%`,
                    backgroundColor: FUNNEL_COLOUR,
                    opacity: d.label === 'Completed' ? 1 : 0.7,
                  }}
                />
              </div>
              <span className="text-xs font-semibold text-foreground w-8 shrink-0">{d.value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Bookings by month */}
      {bookingsByMonth.length > 0 && (
        <div className="space-y-3">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Bookings over time</h3>
            <p className="text-xs text-muted-foreground">Booked vs completed appointments per month</p>
          </div>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={bookingsByMonth} barGap={2} barSize={20}>
                <XAxis
                  dataKey="month"
                  tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                  axisLine={false}
                  tickLine={false}
                  width={28}
                />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: 'hsl(var(--muted))', opacity: 0.3 }} />
                <Bar dataKey="bookings" name="Booked" fill={BAR_COLOUR} radius={[3, 3, 0, 0]} opacity={0.6} />
                <Bar dataKey="completed" name="Completed" fill={BAR_COMPLETED} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  )
}
