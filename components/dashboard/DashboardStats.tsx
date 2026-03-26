'use client'

import { useEffect, useRef, type ReactNode } from 'react'
import { useMotionValue, useSpring, motion } from 'framer-motion'
import { Info, Users, CalendarCheck, MailOpen, MousePointerClick, TrendingUp, CheckCircle2, DollarSign, MessageSquare } from 'lucide-react'
import { cn } from '@/lib/utils'

// Animated count-up for integer values
function CountUp({ target }: { target: number }) {
  const ref = useRef<HTMLSpanElement>(null)
  const mv = useMotionValue(0)
  const spring = useSpring(mv, { stiffness: 70, damping: 18 })

  useEffect(() => {
    mv.set(target)
  }, [mv, target])

  useEffect(() => {
    return spring.on('change', (v) => {
      if (ref.current) ref.current.textContent = Math.round(v).toLocaleString()
    })
  }, [spring])

  return <span ref={ref}>0</span>
}

type AccentColor = 'blue' | 'green' | 'amber' | 'violet' | 'rose' | 'emerald'

const ACCENT_CLASSES: Record<AccentColor, { strip: string; icon: string; iconBg: string }> = {
  blue:    { strip: 'border-t-blue-400/60',    icon: 'text-blue-400',    iconBg: 'bg-blue-500/10 border-blue-400/20' },
  green:   { strip: 'border-t-green-400/60',   icon: 'text-green-400',   iconBg: 'bg-green-500/10 border-green-400/20' },
  amber:   { strip: 'border-t-amber-400/60',   icon: 'text-amber-400',   iconBg: 'bg-amber-500/10 border-amber-400/20' },
  violet:  { strip: 'border-t-violet-400/60',  icon: 'text-violet-400',  iconBg: 'bg-violet-500/10 border-violet-400/20' },
  rose:    { strip: 'border-t-rose-400/60',    icon: 'text-rose-400',    iconBg: 'bg-rose-500/10 border-rose-400/20' },
  emerald: { strip: 'border-t-emerald-400/60', icon: 'text-emerald-400', iconBg: 'bg-emerald-500/10 border-emerald-400/20' },
}

const cardVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.25, 0.4, 0.25, 1] as [number, number, number, number] } },
}

function StatCard({
  label,
  value,
  numericValue,
  sub,
  tooltip,
  icon,
  accent = 'blue',
}: {
  label: string
  value: string
  numericValue?: number
  sub?: string
  tooltip: string
  icon: ReactNode
  accent?: AccentColor
}) {
  const { strip, iconBg, icon: iconClass } = ACCENT_CLASSES[accent]

  return (
    <motion.div
      variants={cardVariants}
      whileHover={{ scale: 1.015, rotateX: 0.5, rotateY: 0.5 }}
      transition={{ type: 'spring', stiffness: 300, damping: 25 }}
      className={cn('glass-card rounded-xl p-4 border-t-2', strip)}
      style={{ transformStyle: 'preserve-3d' }}
    >
      <div className="flex items-start justify-between gap-1 mb-3">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <div className="flex items-center gap-1.5">
          <div className={cn('flex items-center justify-center w-6 h-6 rounded-md border', iconBg)}>
            <span className={cn('w-3.5 h-3.5 [&>svg]:w-3.5 [&>svg]:h-3.5', iconClass)}>{icon}</span>
          </div>
          <div className="relative group">
            <Info className="w-3 h-3 text-muted-foreground/30 cursor-help" />
            <div className="absolute right-0 bottom-full mb-1.5 z-50 hidden group-hover:block w-64 rounded-md border border-border bg-popover p-2.5 text-xs text-popover-foreground shadow-md pointer-events-none">
              {tooltip}
            </div>
          </div>
        </div>
      </div>
      <p className="text-2xl font-bold bg-gradient-to-br from-foreground to-foreground/50 bg-clip-text text-transparent leading-none">
        {numericValue !== undefined ? <CountUp target={numericValue} /> : value}
      </p>
      {sub && <p className="text-xs text-muted-foreground mt-1.5">{sub}</p>}
    </motion.div>
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

const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.06 } },
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
}: DashboardStatsProps) {
  return (
    <motion.div
      className="grid grid-cols-2 md:grid-cols-3 gap-4"
      style={{ perspective: 1000 }}
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      <StatCard
        label="Total leads"
        value={String(totalLeads)}
        numericValue={totalLeads}
        sub="across all campaigns"
        tooltip="Total number of leads uploaded across all campaigns for this client."
        icon={<Users />}
        accent="blue"
      />
      <StatCard
        label="Leads booked"
        value={String(bookedCount)}
        numericValue={bookedCount}
        sub={`${completedCount} completed`}
        tooltip="Number of leads who have booked or completed an appointment."
        icon={<CalendarCheck />}
        accent="green"
      />
      <StatCard
        label="Email open rate"
        value={pct(openedCount, emailsSent)}
        sub={`${openedCount} of ${emailsSent} emails`}
        tooltip="Percentage of sent emails that were opened. Calculated as: emails opened ÷ emails sent. Note: Apple Mail Privacy Protection may inflate this figure."
        icon={<MailOpen />}
        accent="violet"
      />
      <StatCard
        label="Click through rate"
        value={pct(clickedCount, emailsSent)}
        sub={`${clickedCount} leads clicked`}
        tooltip="Percentage of emailed leads who clicked the booking link. Calculated as: leads who clicked ÷ leads emailed."
        icon={<MousePointerClick />}
        accent="amber"
      />
      <StatCard
        label="Booking rate"
        value={pct(bookedCount, totalLeads)}
        sub={`${bookedCount} of ${totalLeads} leads`}
        tooltip="Percentage of all leads who have booked an appointment. Calculated as: leads booked ÷ total leads."
        icon={<TrendingUp />}
        accent="emerald"
      />
      <StatCard
        label="Jobs completed"
        value={String(completedCount)}
        numericValue={completedCount}
        sub={`${pct(completedCount, bookedCount)} completion rate`}
        tooltip="Number of booked appointments that were completed."
        icon={<CheckCircle2 />}
        accent="green"
      />
      <StatCard
        label="Total spend"
        value={`$${(totalSpend / 100).toFixed(2)}`}
        sub="Commission charged for completed jobs"
        tooltip="Total commission charged by the agency for all completed jobs."
        icon={<DollarSign />}
        accent="rose"
      />
      {smsSent > 0 && (
        <StatCard
          label="Leads reached by SMS"
          value={String(uniqueSmsLeads)}
          numericValue={uniqueSmsLeads}
          sub={smsOptedOut > 0 ? `${pct(smsOptedOut, uniqueSmsLeads)} opt-out rate` : 'no opt-outs'}
          tooltip="The number of leads who were contacted by SMS during this campaign."
          icon={<MessageSquare />}
          accent="blue"
        />
      )}
    </motion.div>
  )
}
