import Link from 'next/link'
import type { Service } from '@/db/queries/service'
import { cn } from '@/lib/utils'

const currencyFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
})

// A plain navigational Link styled as a card: choosing a service is a real
// navigation to `?servico=<id>`, not client state, so the choice lives in
// the URL and Back/share both work without any client-side code here.
export function ServiceCard({
  service,
  href,
}: {
  service: Service
  href: string
}) {
  return (
    <Link
      href={href}
      className={cn(
        'flex min-h-16 flex-col gap-1 rounded-lg border border-border bg-surface p-4 text-left transition-colors',
        'hover:bg-surface-raised',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <span className="font-medium text-fg">{service.name}</span>
        <span className="tnum shrink-0 font-medium text-fg">
          {currencyFormatter.format(service.priceCents / 100)}
        </span>
      </div>
      {service.description ? (
        <p className="text-sm text-fg-muted">{service.description}</p>
      ) : null}
      <span className="tnum text-sm text-fg-muted">
        {service.durationMinutes} min
      </span>
    </Link>
  )
}
