'use client'

import { useState } from 'react'
import { ChevronDown, ChevronUp, Mail, MessageSquare, Info } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Step {
  icon: 'email' | 'sms'
  label: string
  timing: string
  note?: string
}

const EMAIL_STEPS: Step[] = [
  {
    icon: 'email',
    label: 'Email 1',
    timing: 'Sent at the next optimal window (Mon–Fri, 9am–2pm AEST)',
  },
  {
    icon: 'email',
    label: 'Email 2',
    timing: '2 days after Email 1 (if clicked) · 3 days if opened or unopened',
    note: 'Content varies by engagement — clicked, opened, and unopened leads each get a different message.',
  },
  {
    icon: 'email',
    label: 'Email 3',
    timing: '3 days after Email 2',
    note: 'Content adapts based on whether Email 2 was opened.',
  },
  {
    icon: 'email',
    label: 'Email 4',
    timing: '7 days after Email 3',
    note: 'Final re-engagement. No further messages are sent after this.',
  },
]

const SMS_STEPS: Step[] = [
  {
    icon: 'sms',
    label: 'SMS 1',
    timing: 'Sent at the next allowed window (Mon–Sat, 9am–7pm AEST)',
  },
  {
    icon: 'sms',
    label: 'SMS 2',
    timing: '48 hours after SMS 1',
  },
  {
    icon: 'sms',
    label: 'SMS 3',
    timing: '48 hours after SMS 2',
    note: 'Final message. No further messages are sent after this.',
  },
]

const BOTH_STEPS: Step[] = [
  {
    icon: 'email',
    label: 'Email 1',
    timing: 'Sent at the next optimal window (Mon–Fri, 9am–2pm AEST)',
  },
  {
    icon: 'sms',
    label: 'SMS 1',
    timing: '~24 hours after Email 1',
    note: 'Only sent if Email 1 was not clicked. Skipped automatically if the lead has already responded.',
  },
  {
    icon: 'email',
    label: 'Email 2',
    timing: '2 days after Email 1 (if clicked) · 3 days otherwise',
    note: 'Content varies by engagement — clicked, opened, and unopened leads get different messages.',
  },
  {
    icon: 'sms',
    label: 'SMS 2',
    timing: '48 hours after Email 2',
    note: 'Only sent if Email 2 was not clicked.',
  },
  {
    icon: 'email',
    label: 'Email 3',
    timing: '3 days after Email 2',
    note: 'Content adapts based on whether Email 2 was opened.',
  },
  {
    icon: 'sms',
    label: 'SMS 3',
    timing: '48 hours after Email 3',
    note: 'Only sent if Email 3 was not clicked.',
  },
  {
    icon: 'email',
    label: 'Email 4',
    timing: '7 days after Email 3',
    note: 'Final re-engagement. No further messages are sent after this.',
  },
]

const CHANNEL_LABELS: Record<string, string> = {
  email: 'Email-only sequence (4 emails)',
  sms: 'SMS-only sequence (3 messages)',
  both: 'Email + SMS sequence (4 emails, 3 SMS)',
}

interface Props {
  channel: string
}

export function CampaignSequenceInfo({ channel }: Props) {
  const [open, setOpen] = useState(false)

  const steps = channel === 'sms' ? SMS_STEPS : channel === 'both' ? BOTH_STEPS : EMAIL_STEPS

  return (
    <div className="rounded-lg border border-border bg-muted/10">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm text-left hover:bg-muted/20 transition-colors rounded-lg"
      >
        <span className="flex items-center gap-2 text-muted-foreground">
          <Info className="w-4 h-4 shrink-0" />
          <span>
            <span className="font-medium text-foreground">How this campaign works</span>
            <span className="ml-2 text-xs">{CHANNEL_LABELS[channel] ?? channel}</span>
          </span>
        </span>
        {open ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-1">
          <div className="relative pl-6">
            {/* Vertical connector line */}
            <div className="absolute left-2.5 top-2 bottom-2 w-px bg-border" />

            {steps.map((step, i) => (
              <div key={i} className="relative py-2.5">
                {/* Dot on line */}
                <div className={cn(
                  'absolute left-[-14px] top-3.5 w-2 h-2 rounded-full border-2',
                  step.icon === 'email'
                    ? 'bg-background border-blue-500'
                    : 'bg-background border-green-500'
                )} />

                <div className="space-y-0.5">
                  <div className="flex items-center gap-1.5">
                    {step.icon === 'email'
                      ? <Mail className="w-3 h-3 text-blue-500 shrink-0" />
                      : <MessageSquare className="w-3 h-3 text-green-600 shrink-0" />
                    }
                    <span className="text-xs font-medium text-foreground">{step.label}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">{step.timing}</p>
                  {step.note && (
                    <p className="text-xs text-muted-foreground/70 italic">{step.note}</p>
                  )}
                </div>
              </div>
            ))}
          </div>

          <p className="text-xs text-muted-foreground/60 pt-1 border-t border-border mt-2">
            All sends respect quiet hours. Email sends pause on weekends and after 2pm AEST.
            SMS sends pause on Sundays and outside 9am–7pm AEST. Leads who book are automatically
            removed from further sends.
          </p>
        </div>
      )}
    </div>
  )
}
