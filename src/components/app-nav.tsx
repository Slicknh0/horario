'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  CalendarIcon,
  ClockIcon,
  ScissorsIcon,
  SettingsIcon,
} from '@/components/icons'
import { cn } from '@/lib/utils'

const NAV_ITEMS = [
  { href: '/app', label: 'Agenda', icon: CalendarIcon },
  { href: '/app/servicos', label: 'Serviços', icon: ScissorsIcon },
  { href: '/app/horarios', label: 'Horários', icon: ClockIcon },
  { href: '/app/configuracoes', label: 'Configurações', icon: SettingsIcon },
] as const

// A Client Component because active-item highlighting needs the current
// pathname, and layouts don't re-render on navigation (so a Server
// Component parent can't read it directly) — see Next's layout.js caveats
// on pathname.
export function AppNav() {
  const pathname = usePathname()

  return (
    <nav
      aria-label="Navegação principal"
      className="flex flex-1 flex-col gap-0.5 md:flex-col"
    >
      {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
        const isActive =
          href === '/app' ? pathname === '/app' : pathname.startsWith(href)

        return (
          <Link
            key={href}
            href={href}
            aria-current={isActive ? 'page' : undefined}
            className={cn(
              'flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface',
              isActive
                ? 'bg-surface-raised text-accent'
                : 'text-fg-muted hover:bg-surface-raised hover:text-fg',
            )}
          >
            <Icon className="size-4 shrink-0" />
            {label}
          </Link>
        )
      })}
    </nav>
  )
}
