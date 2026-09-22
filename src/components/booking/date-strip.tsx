import Link from 'next/link'
import type { MouseEvent } from 'react'
import type { LocalDate } from '@/domain/types'
import { cn, isPlainLeftClick } from '@/lib/utils'

const WEEKDAY_LABELS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']

// LocalDate is a plain calendar date (YYYY-MM-DD), already resolved to the
// tenant's timezone by the caller — parsing it as UTC here just reads the
// calendar fields back out, it never re-interprets the date through another
// timezone.
function weekdayLabel(date: LocalDate, today: LocalDate): string {
  if (date === today) return 'Hoje'
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay()
  return WEEKDAY_LABELS[weekday] ?? ''
}

function dayNumber(date: LocalDate): string {
  return date.slice(8, 10)
}

// A horizontally scrolling strip, not a paginated calendar: every day in
// the window stays reachable by touch/swipe or Tab. A day with zero free
// slots is marked "cheio" rather than removed from the strip — hiding it
// would make the remaining dates look non-contiguous.
//
// The selected day is never shown in accent: this project reserves accent
// for exactly three things (primary CTA, selected slot, focus ring), and
// "selected day" is not one of them — a border + surface-raised background
// says "current" without spending that color.
export function DateStrip({
  slug,
  serviceId,
  days,
  selectedDate,
  today,
  onNavigate,
}: {
  slug: string
  serviceId: string
  days: { date: LocalDate; hasSlots: boolean }[]
  selectedDate: LocalDate
  today: LocalDate
  // Called synchronously, in the same click, with the href being navigated
  // to — but only for a plain left click on a day that actually differs
  // from the one already selected (clicking the already-selected day, or
  // a modified click meant to open a new tab/download, isn't something
  // the caller needs to know about). The caller is expected to drive its
  // own `startTransition(() => router.push(href))` from this — see the
  // comment on BookingFlow's `isPending` (from `useTransition`) for why:
  // Next.js's client-side transitions deliberately keep the outgoing page
  // interactive while the new one loads (that's what makes navigation
  // feel instant), so without some pending signal the still-live SlotGrid
  // for the day being left can register a click for a slot that belongs
  // to the wrong day, moments before BookingFlow remounts (keyed by day)
  // and silently discards whatever that click just set.
  onNavigate?: (href: string) => void
}) {
  return (
    <fieldset className="m-0 border-0 p-0">
      <legend className="sr-only">Escolha o dia</legend>
      <div className="-mx-4 flex snap-x gap-2 overflow-x-auto px-4 pb-1">
        {days.map(({ date, hasSlots }) => {
          const isSelected = date === selectedDate
          const href = `/b/${slug}?servico=${serviceId}&data=${date}`
          function handleClick(event: MouseEvent<HTMLAnchorElement>) {
            // No callback wired up, already on this day (Next won't even
            // push a new history entry for it, so there's nothing to
            // track), or a modified click (new tab, download, etc.):
            // deliberately NOT calling preventDefault() in any of these
            // cases leaves it to next/link's own click handling (plain
            // href-based navigation, or — for a modified click — its own
            // independent recognition of the same condition, so nothing
            // double-fires either way).
            if (!onNavigate || isSelected || !isPlainLeftClick(event)) return
            event.preventDefault()
            onNavigate(href)
          }
          return (
            <Link
              key={date}
              href={href}
              aria-current={isSelected ? 'date' : undefined}
              onClick={handleClick}
              className={cn(
                'flex h-16 w-14 shrink-0 snap-start flex-col items-center justify-center gap-0.5 rounded-md border text-sm transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
                isSelected
                  ? 'border-fg bg-surface-raised font-semibold text-fg'
                  : 'border-border bg-surface text-fg hover:bg-surface-raised',
              )}
            >
              <span className="text-[11px] text-fg-muted">
                {weekdayLabel(date, today)}
              </span>
              <span className="tnum text-base">{dayNumber(date)}</span>
              {hasSlots ? null : (
                <span className="text-[10px] text-fg-muted">cheio</span>
              )}
            </Link>
          )
        })}
      </div>
    </fieldset>
  )
}
