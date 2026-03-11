'use client'

import { useState } from 'react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts'
import { Download } from 'lucide-react'
import { cn } from '@/lib/utils'

// ============================================================
// Types
// ============================================================

export interface ToneRow {
  tone: string
  campaigns: number
  avgOpenRate: number
  avgClickRate: number
  avgBookingRate: number
  avgCompletionRate: number
}

export interface ChannelRow {
  channel: string
  campaigns: number
  avgOpenRate: number
  avgBookingRate: number
  avgCompletionRate: number
  avgTimeToBookingHours: number
}

export interface IndustryRow {
  industry: string
  campaigns: number
  avgOpenRate: number
  avgClickRate: number
  avgBookingRate: number
  avgCompletionRate: number
}

export interface SequenceRow {
  position: number
  emailsSent: number
  opens: number
  clicks: number
  openRate: number
  clickRate: number
  bookingsFromStep: number
}

export interface HeatmapCell {
  dayOfWeek: number
  hour: number
  sends: number
  opens: number
  openRate: number
}

export interface TopSubjectRow {
  subject: string
  openRate: number
  sends: number
  campaigns: number
}

export interface TopBodyRow {
  bodySnippet: string
  clickRate: number
  sends: number
}

export interface IntelligenceData {
  range: string
  headline: {
    totalCampaigns: number
    totalLeadsContacted: number
    overallBookingRate: number
    overallCompletionRate: number
  }
  byTone: ToneRow[]
  byChannel: ChannelRow[]
  byIndustry: IndustryRow[]
  bySequence: SequenceRow[]
  sendTimeHeatmap: HeatmapCell[][]
  topSubjects: TopSubjectRow[]
  topBodies: TopBodyRow[]
}

// ============================================================
// Helpers
// ============================================================

const TABS = [
  'By Tone',
  'By Channel',
  'By Industry',
  'By Sequence',
  'By Send Time',
  'Top Performers',
] as const
type Tab = (typeof TABS)[number]

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function pct(n: number) {
  return `${n}%`
}

function downloadCSV(rows: Record<string, unknown>[], filename: string) {
  if (rows.length === 0) return
  const headers = Object.keys(rows[0])
  const lines = rows.map((row) =>
    headers.map((h) => JSON.stringify(row[h] ?? '')).join(',')
  )
  const csv = [headers.join(','), ...lines].join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function heatmapColour(openRate: number, avg: number) {
  if (openRate === 0) return 'bg-muted/20 text-muted-foreground'
  if (openRate >= avg * 1.2) return 'bg-green-500/20 text-green-700 dark:text-green-400 font-semibold'
  if (openRate >= avg * 0.8) return 'bg-blue-500/10 text-foreground'
  return 'bg-muted/30 text-muted-foreground'
}

// ============================================================
// Component
// ============================================================

export function IntelligenceTabs({ data }: { data: IntelligenceData }) {
  const [activeTab, setActiveTab] = useState<Tab>('By Tone')

  // Average open rate across all cells for heatmap highlight
  const allCells = data.sendTimeHeatmap.flat().filter((c) => c.sends > 0)
  const avgOpenRate =
    allCells.length > 0
      ? allCells.reduce((s, c) => s + c.openRate, 0) / allCells.length
      : 0

  function getExportData(): Record<string, unknown>[] {
    switch (activeTab) {
      case 'By Tone':
        return data.byTone.map((r) => ({
          tone: r.tone,
          campaigns: r.campaigns,
          open_rate_pct: r.avgOpenRate,
          click_rate_pct: r.avgClickRate,
          booking_rate_pct: r.avgBookingRate,
          completion_rate_pct: r.avgCompletionRate,
        }))
      case 'By Channel':
        return data.byChannel.map((r) => ({
          channel: r.channel,
          campaigns: r.campaigns,
          open_rate_pct: r.avgOpenRate,
          booking_rate_pct: r.avgBookingRate,
          completion_rate_pct: r.avgCompletionRate,
          avg_time_to_booking_hours: r.avgTimeToBookingHours,
        }))
      case 'By Industry':
        return data.byIndustry.map((r) => ({
          industry: r.industry,
          campaigns: r.campaigns,
          open_rate_pct: r.avgOpenRate,
          click_rate_pct: r.avgClickRate,
          booking_rate_pct: r.avgBookingRate,
          completion_rate_pct: r.avgCompletionRate,
        }))
      case 'By Sequence':
        return data.bySequence.map((r) => ({
          email_position: r.position,
          emails_sent: r.emailsSent,
          opens: r.opens,
          clicks: r.clicks,
          open_rate_pct: r.openRate,
          click_rate_pct: r.clickRate,
          bookings_attributed: r.bookingsFromStep,
        }))
      case 'By Send Time':
        return data.sendTimeHeatmap
          .flat()
          .filter((c) => c.sends > 0)
          .map((c) => ({
            day: DAYS[c.dayOfWeek],
            hour: c.hour,
            sends: c.sends,
            opens: c.opens,
            open_rate_pct: c.openRate,
          }))
      case 'Top Performers':
        return data.topSubjects.map((r) => ({
          subject_line: r.subject,
          open_rate_pct: r.openRate,
          sends: r.sends,
          campaigns: r.campaigns,
        }))
      default:
        return []
    }
  }

  return (
    <div className="space-y-6">
      {/* Headline stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total campaigns', value: String(data.headline.totalCampaigns) },
          { label: 'Leads contacted', value: String(data.headline.totalLeadsContacted) },
          { label: 'Overall booking rate', value: pct(data.headline.overallBookingRate) },
          { label: 'Overall completion rate', value: pct(data.headline.overallCompletionRate) },
        ].map(({ label, value }) => (
          <div key={label} className="p-4 rounded-lg border border-border bg-card">
            <p className="text-xs text-muted-foreground mb-1">{label}</p>
            <p className="text-2xl font-semibold text-foreground">{value}</p>
          </div>
        ))}
      </div>

      {/* Tab bar + export */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex gap-1 flex-wrap">
          {TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                'px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
                activeTab === tab
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'
              )}
            >
              {tab}
            </button>
          ))}
        </div>
        <button
          onClick={() => downloadCSV(getExportData(), `intelligence-${activeTab.toLowerCase().replace(/\s+/g, '-')}.csv`)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors border border-border"
        >
          <Download className="w-3.5 h-3.5" />
          Export CSV
        </button>
      </div>

      {/* Tab content */}
      <div className="space-y-6">

        {/* BY TONE */}
        {activeTab === 'By Tone' && (
          <div className="space-y-4">
            {data.byTone.length === 0 ? (
              <p className="text-sm text-muted-foreground">No data yet.</p>
            ) : (
              <>
                <div className="rounded-lg border border-border overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-muted/30 border-b border-border">
                        <th className="text-left font-medium px-4 py-3 text-muted-foreground">Tone</th>
                        <th className="text-left font-medium px-4 py-3 text-muted-foreground">Campaigns</th>
                        <th className="text-left font-medium px-4 py-3 text-muted-foreground">Open rate</th>
                        <th className="text-left font-medium px-4 py-3 text-muted-foreground">Click rate</th>
                        <th className="text-left font-medium px-4 py-3 text-muted-foreground">Booking rate</th>
                        <th className="text-left font-medium px-4 py-3 text-muted-foreground">Completion rate</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.byTone.map((row) => (
                        <tr key={row.tone} className="border-b border-border last:border-0">
                          <td className="px-4 py-3 font-medium capitalize">{row.tone}</td>
                          <td className="px-4 py-3 text-muted-foreground">{row.campaigns}</td>
                          <td className="px-4 py-3 font-mono">{pct(row.avgOpenRate)}</td>
                          <td className="px-4 py-3 font-mono">{pct(row.avgClickRate)}</td>
                          <td className="px-4 py-3 font-mono">{pct(row.avgBookingRate)}</td>
                          <td className="px-4 py-3 font-mono">{pct(row.avgCompletionRate)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.byTone} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="tone" tick={{ fontSize: 12 }} />
                      <YAxis tick={{ fontSize: 12 }} unit="%" />
                      <Tooltip formatter={(v) => `${v}%`} />
                      <Bar dataKey="avgOpenRate" name="Open rate" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} />
                      <Bar dataKey="avgBookingRate" name="Booking rate" fill="hsl(var(--primary) / 0.4)" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </>
            )}
          </div>
        )}

        {/* BY CHANNEL */}
        {activeTab === 'By Channel' && (
          <div className="space-y-4">
            {data.byChannel.length === 0 ? (
              <p className="text-sm text-muted-foreground">No data yet.</p>
            ) : (
              <>
                <div className="rounded-lg border border-border overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-muted/30 border-b border-border">
                        <th className="text-left font-medium px-4 py-3 text-muted-foreground">Channel</th>
                        <th className="text-left font-medium px-4 py-3 text-muted-foreground">Campaigns</th>
                        <th className="text-left font-medium px-4 py-3 text-muted-foreground">Open rate</th>
                        <th className="text-left font-medium px-4 py-3 text-muted-foreground">Booking rate</th>
                        <th className="text-left font-medium px-4 py-3 text-muted-foreground">Completion rate</th>
                        <th className="text-left font-medium px-4 py-3 text-muted-foreground">Avg. time to booking</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.byChannel.map((row) => (
                        <tr key={row.channel} className="border-b border-border last:border-0">
                          <td className="px-4 py-3 font-medium uppercase">{row.channel}</td>
                          <td className="px-4 py-3 text-muted-foreground">{row.campaigns}</td>
                          <td className="px-4 py-3 font-mono">{pct(row.avgOpenRate)}</td>
                          <td className="px-4 py-3 font-mono">{pct(row.avgBookingRate)}</td>
                          <td className="px-4 py-3 font-mono">{pct(row.avgCompletionRate)}</td>
                          <td className="px-4 py-3 text-muted-foreground">
                            {row.avgTimeToBookingHours > 0 ? `${row.avgTimeToBookingHours}h` : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.byChannel} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="channel" tick={{ fontSize: 12 }} />
                      <YAxis tick={{ fontSize: 12 }} unit="%" />
                      <Tooltip formatter={(v) => `${v}%`} />
                      <Bar dataKey="avgBookingRate" name="Booking rate" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} />
                      <Bar dataKey="avgCompletionRate" name="Completion rate" fill="hsl(var(--primary) / 0.4)" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </>
            )}
          </div>
        )}

        {/* BY INDUSTRY */}
        {activeTab === 'By Industry' && (
          <div className="space-y-4">
            {data.byIndustry.length === 0 ? (
              <div className="text-sm text-muted-foreground space-y-1">
                <p>No industry data yet.</p>
                <p>Set <strong>client industry</strong> on each client page to enable this breakdown.</p>
              </div>
            ) : (
              <>
                <div className="rounded-lg border border-border overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-muted/30 border-b border-border">
                        <th className="text-left font-medium px-4 py-3 text-muted-foreground">Industry</th>
                        <th className="text-left font-medium px-4 py-3 text-muted-foreground">Campaigns</th>
                        <th className="text-left font-medium px-4 py-3 text-muted-foreground">Open rate</th>
                        <th className="text-left font-medium px-4 py-3 text-muted-foreground">Click rate</th>
                        <th className="text-left font-medium px-4 py-3 text-muted-foreground">Booking rate</th>
                        <th className="text-left font-medium px-4 py-3 text-muted-foreground">Completion rate</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.byIndustry.map((row) => (
                        <tr key={row.industry} className="border-b border-border last:border-0">
                          <td className="px-4 py-3 font-medium">{row.industry}</td>
                          <td className="px-4 py-3 text-muted-foreground">{row.campaigns}</td>
                          <td className="px-4 py-3 font-mono">{pct(row.avgOpenRate)}</td>
                          <td className="px-4 py-3 font-mono">{pct(row.avgClickRate)}</td>
                          <td className="px-4 py-3 font-mono">{pct(row.avgBookingRate)}</td>
                          <td className="px-4 py-3 font-mono">{pct(row.avgCompletionRate)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.byIndustry} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="industry" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 12 }} unit="%" />
                      <Tooltip formatter={(v) => `${v}%`} />
                      <Bar dataKey="avgOpenRate" name="Open rate" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} />
                      <Bar dataKey="avgBookingRate" name="Booking rate" fill="hsl(var(--primary) / 0.4)" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </>
            )}
          </div>
        )}

        {/* BY SEQUENCE POSITION */}
        {activeTab === 'By Sequence' && (
          <div className="space-y-4">
            {data.bySequence.length === 0 ? (
              <p className="text-sm text-muted-foreground">No emails sent yet.</p>
            ) : (
              <>
                <div className="rounded-lg border border-border overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-muted/30 border-b border-border">
                        <th className="text-left font-medium px-4 py-3 text-muted-foreground">Email</th>
                        <th className="text-left font-medium px-4 py-3 text-muted-foreground">Sent</th>
                        <th className="text-left font-medium px-4 py-3 text-muted-foreground">Opens</th>
                        <th className="text-left font-medium px-4 py-3 text-muted-foreground">Open rate</th>
                        <th className="text-left font-medium px-4 py-3 text-muted-foreground">Clicks</th>
                        <th className="text-left font-medium px-4 py-3 text-muted-foreground">Click rate</th>
                        <th className="text-left font-medium px-4 py-3 text-muted-foreground">Bookings</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.bySequence.map((row) => (
                        <tr key={row.position} className="border-b border-border last:border-0">
                          <td className="px-4 py-3 font-medium">Email {row.position}</td>
                          <td className="px-4 py-3 text-muted-foreground">{row.emailsSent.toLocaleString()}</td>
                          <td className="px-4 py-3 text-muted-foreground">{row.opens.toLocaleString()}</td>
                          <td className="px-4 py-3 font-mono">{pct(row.openRate)}</td>
                          <td className="px-4 py-3 text-muted-foreground">{row.clicks.toLocaleString()}</td>
                          <td className="px-4 py-3 font-mono">{pct(row.clickRate)}</td>
                          <td className="px-4 py-3 text-muted-foreground">{row.bookingsFromStep}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={data.bySequence.map((r) => ({ ...r, label: `Email ${r.position}` }))}
                      margin={{ top: 0, right: 0, left: -20, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                      <YAxis tick={{ fontSize: 12 }} unit="%" />
                      <Tooltip formatter={(v) => `${v}%`} />
                      <Bar dataKey="openRate" name="Open rate" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} />
                      <Bar dataKey="clickRate" name="Click rate" fill="hsl(var(--primary) / 0.4)" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </>
            )}
          </div>
        )}

        {/* BY SEND TIME (heatmap) */}
        {activeTab === 'By Send Time' && (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Open rates by day and hour (UTC). Cells highlighted when &gt;20% above campaign average.
            </p>
            <div className="overflow-x-auto">
              <table className="text-xs border-collapse">
                <thead>
                  <tr>
                    <th className="w-10 text-left pr-2 text-muted-foreground font-normal" />
                    {Array.from({ length: 24 }, (_, h) => (
                      <th key={h} className="w-8 text-center text-muted-foreground font-normal pb-1">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.sendTimeHeatmap.map((dayRow, dayIdx) => (
                    <tr key={dayIdx}>
                      <td className="pr-2 text-muted-foreground font-medium">{DAYS[dayIdx]}</td>
                      {dayRow.map((cell, hourIdx) => (
                        <td
                          key={hourIdx}
                          className={cn(
                            'w-8 h-7 text-center rounded-sm cursor-default',
                            heatmapColour(cell.openRate, avgOpenRate)
                          )}
                          title={cell.sends > 0 ? `${cell.sends} sends · ${cell.openRate}% open rate` : 'No sends'}
                        >
                          {cell.sends > 0 ? cell.openRate : ''}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TOP PERFORMERS */}
        {activeTab === 'Top Performers' && (
          <div className="space-y-8">
            {/* Top subject lines */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-foreground">Top 20 subject lines by open rate</h3>
              {data.topSubjects.length === 0 ? (
                <p className="text-sm text-muted-foreground">No data yet.</p>
              ) : (
                <div className="rounded-lg border border-border overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-muted/30 border-b border-border">
                        <th className="text-left font-medium px-4 py-3 text-muted-foreground">Subject line</th>
                        <th className="text-left font-medium px-4 py-3 text-muted-foreground">Open rate</th>
                        <th className="text-left font-medium px-4 py-3 text-muted-foreground">Sends</th>
                        <th className="text-left font-medium px-4 py-3 text-muted-foreground">Campaigns</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.topSubjects.map((row, i) => (
                        <tr key={i} className="border-b border-border last:border-0">
                          <td className="px-4 py-3 max-w-sm">{row.subject}</td>
                          <td className="px-4 py-3 font-mono font-semibold text-green-600 dark:text-green-400">
                            {pct(row.openRate)}
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">{row.sends}</td>
                          <td className="px-4 py-3 text-muted-foreground">{row.campaigns}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Top email bodies */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-foreground">Top 10 email bodies by click rate</h3>
              {data.topBodies.length === 0 ? (
                <p className="text-sm text-muted-foreground">No data yet.</p>
              ) : (
                <div className="rounded-lg border border-border overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-muted/30 border-b border-border">
                        <th className="text-left font-medium px-4 py-3 text-muted-foreground">Body snippet</th>
                        <th className="text-left font-medium px-4 py-3 text-muted-foreground">Click rate</th>
                        <th className="text-left font-medium px-4 py-3 text-muted-foreground">Sends</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.topBodies.map((row, i) => (
                        <tr key={i} className="border-b border-border last:border-0">
                          <td className="px-4 py-3 text-muted-foreground max-w-sm">{row.bodySnippet}</td>
                          <td className="px-4 py-3 font-mono font-semibold text-blue-600 dark:text-blue-400">
                            {pct(row.clickRate)}
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">{row.sends}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
