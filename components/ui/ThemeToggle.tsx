'use client'

import { useTheme } from 'next-themes'
import { useEffect, useState } from 'react'
import { Sun, Moon, Waves } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'

const THEMES = [
  { id: 'light',    label: 'Light',    Icon: Sun   },
  { id: 'dark',     label: 'Dark',     Icon: Moon  },
  { id: 'midnight', label: 'Midnight', Icon: Waves },
] as const

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])

  const current = THEMES.find((t) => t.id === theme) ?? THEMES[1]
  const CurrentIcon = current.Icon

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="inline-flex items-center justify-center rounded-md w-8 h-8 text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors outline-none"
        title="Change theme"
      >
        {mounted ? <CurrentIcon className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-36">
        {THEMES.map(({ id, label, Icon }) => (
          <DropdownMenuItem
            key={id}
            onClick={() => setTheme(id)}
            className={cn('gap-2 cursor-pointer', theme === id && 'bg-accent text-accent-foreground')}
          >
            <Icon className="w-4 h-4" />
            {label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
