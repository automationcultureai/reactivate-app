'use client'

import { useEffect, useRef, type ReactNode } from 'react'
import { useMotionValue, useSpring, motion } from 'framer-motion'
import { Info } from 'lucide-react'

function GlassFilter() {
  return (
    <svg className="hidden" aria-hidden>
      <defs>
        <filter id="stat-glass" x="0%" y="0%" width="100%" height="100%" colorInterpolationFilters="sRGB">
          <feTurbulence type="fractalNoise" baseFrequency="0.05 0.05" numOctaves="1" seed="1" result="turbulence" />
          <feGaussianBlur in="turbulence" stdDeviation="2" result="blurredNoise" />
          <feDisplacementMap in="SourceGraphic" in2="blurredNoise" scale="70" xChannelSelector="R" yChannelSelector="B" result="displaced" />
          <feGaussianBlur in="displaced" stdDeviation="4" result="finalBlur" />
          <feComposite in="finalBlur" in2="finalBlur" operator="over" />
        </filter>
      </defs>
    </svg>
  )
}

function CountUp({ target }: { target: number }) {
  const ref = useRef<HTMLSpanElement>(null)
  const mv = useMotionValue(0)
  const spring = useSpring(mv, { stiffness: 70, damping: 18 })
  useEffect(() => { mv.set(target) }, [mv, target])
  useEffect(() => spring.on('change', (v) => {
    if (ref.current) ref.current.textContent = Math.round(v).toLocaleString()
  }), [spring])
  return <span ref={ref}>0</span>
}

const SHADOW_LIGHT = '0 0 6px rgba(0,0,0,0.03),0 2px 6px rgba(0,0,0,0.08),inset 3px 3px 0.5px -3px rgba(0,0,0,0.9),inset -3px -3px 0.5px -3px rgba(0,0,0,0.85),inset 1px 1px 1px -0.5px rgba(0,0,0,0.6),inset -1px -1px 1px -0.5px rgba(0,0,0,0.6),inset 0 0 6px 6px rgba(0,0,0,0.12),inset 0 0 2px 2px rgba(0,0,0,0.06),0 0 12px rgba(255,255,255,0.15)'
const SHADOW_DARK  = '0 0 8px rgba(0,0,0,0.03),0 2px 6px rgba(0,0,0,0.08),inset 3px 3px 0.5px -3.5px rgba(255,255,255,0.09),inset -3px -3px 0.5px -3.5px rgba(255,255,255,0.85),inset 1px 1px 1px -0.5px rgba(255,255,255,0.6),inset -1px -1px 1px -0.5px rgba(255,255,255,0.6),inset 0 0 6px 6px rgba(255,255,255,0.12),inset 0 0 2px 2px rgba(255,255,255,0.06),0 0 12px rgba(0,0,0,0.15)'

const cardVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.25, 0.4, 0.25, 1] as [number,number,number,number] } },
}

function StatCard({ label, value, numericValue, sub, tooltip }: {
  label: string; value: string | ReactNode; numericValue?: number; sub?: string; tooltip: string
}) {
  return (
    <motion.div variants={cardVariants} className="relative z-0 hover:z-[999]">
      <motion.div
        whileHover={{ scale: 1.015 }}
        transition={{ type: 'spring', stiffness: 300, damping: 25 }}
        className="relative rounded-xl cursor-default"
        style={{ boxShadow: SHADOW_LIGHT }}
      >
        <style>{`.dark .stat-rim,.midnight .stat-rim{box-shadow:${SHADOW_DARK}!important}`}</style>
        <div className="stat-rim absolute inset-0 rounded-xl pointer-events-none" />
        <div className="absolute inset-0 z-0 overflow-hidden rounded-xl" style={{ backdropFilter: 'url("#stat-glass") blur(12px)' }} />
        <div className="absolute inset-0 z-10 rounded-xl bg-white/30 dark:bg-white/[0.06] midnight:bg-white/[0.08]" />
        <div className="relative z-20 p-4">
          <div className="flex items-start justify-between gap-2 mb-3">
            <p className="text-sm font-medium text-muted-foreground leading-tight">{label}</p>
            <div className="relative group flex-shrink-0">
              <Info className="w-3.5 h-3.5 text-muted-foreground/40 cursor-help mt-0.5" />
              <div className="absolute right-0 bottom-full mb-2 z-[9999] hidden group-hover:block w-64 rounded-md border border-border bg-popover p-2.5 text-xs text-popover-foreground shadow-xl pointer-events-none">
                {tooltip}
              </div>
            </div>
          </div>
          <p className="text-2xl font-bold text-foreground leading-none">
            {numericValue !== undefined ? <CountUp target={numericValue} /> : value}
          </p>
          {sub && <p className="text-xs text-muted-foreground mt-1.5">{sub}</p>}
        </div>
      </motion.div>
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
  smsSent: number
  smsOptedOut: number
  smsSeqCounts: { sms1: number; sms2: number; sms3: number; sms4: number }
  bookedFromEmail: number
  bookedFromSMS: number
}

const containerVariants = { hidden: {}, visible: { transition: { staggerChildren: 0.06 } } }

export function DashboardStats({
  totalLeads, bookedCount, emailsSent, openedCount, clickedCount,
  completedCount, smsSent, smsOptedOut, bookedFromEmail, bookedFromSMS,
}: DashboardStatsProps) {
  return (
    <>
      <GlassFilter />
      <motion.div className="grid grid-cols-2 md:grid-cols-3 gap-4" variants={containerVariants} initial="hidden" animate="visible">

        {/* Row 1: Pipeline */}
        <StatCard label="Total leads" value={String(totalLeads)} numericValue={totalLeads} sub="across all campaigns" tooltip="Total number of leads uploaded across all campaigns for this client." />
        <StatCard label="Leads booked" value={String(bookedCount)} numericValue={bookedCount} sub={`${completedCount} completed`} tooltip="Number of leads who have booked or completed an appointment." />
        <StatCard label="Jobs completed" value={String(completedCount)} numericValue={completedCount} sub={`${pct(completedCount, bookedCount)} completion rate`} tooltip="Number of booked appointments that were completed." />

        {/* Row 2: Email performance */}
        <StatCard label="Email open rate" value={pct(openedCount, emailsSent)} sub={`${openedCount} of ${emailsSent} emails`} tooltip="Percentage of sent emails that were opened. Note: Apple Mail Privacy Protection may inflate this figure." />
        <StatCard label="Click through rate" value={pct(clickedCount, emailsSent)} sub={`${clickedCount} leads clicked`} tooltip="Percentage of emailed leads who clicked the booking link." />
        <StatCard label="Booked from email" value={String(bookedFromEmail)} numericValue={bookedFromEmail} sub={`${pct(bookedFromEmail, bookedCount)} of all bookings`} tooltip="Leads who received at least one email and went on to book an appointment." />

        {/* Row 3: SMS (only when active) */}
        {smsSent > 0 && (
          <>
            <StatCard label="Total SMS sent" value={String(smsSent)} numericValue={smsSent} sub="across all sequences" tooltip="Total number of SMS messages sent across all sequences and leads." />
            <StatCard label="Booked from SMS" value={String(bookedFromSMS)} numericValue={bookedFromSMS} sub={`${pct(bookedFromSMS, bookedCount)} of all bookings`} tooltip="Leads who received at least one SMS and went on to book an appointment." />
            <StatCard label="SMS opt-outs" value={String(smsOptedOut)} numericValue={smsOptedOut} sub={smsOptedOut > 0 ? `${pct(smsOptedOut, smsSent)} opt-out rate` : 'no opt-outs'} tooltip="Number of leads who replied STOP or opted out of SMS messages." />
          </>
        )}

      </motion.div>
    </>
  )
}
