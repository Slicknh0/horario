import Link from 'next/link'
import type { LocalDate } from '@/domain/types'
import { cn } from '@/lib/utils'

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
  // Called synchronously, in the same click, only when the clicked day
  // actually differs from the one already selected (a click on the
  // already-selected day's own link is not a navigation — Next won't
  // remount BookingFlow for it, so nothing needs to be armed). See the
  // comment on BookingFlow's `isNavigatingAway` state for what this
  // closes: Next.js's client-side transition deliberately keeps the
  // outgoing page interactive while the new one loads (that's what makes
  // it feel instant), so without this the still-live SlotGrid for the day
  // being left can register a click for a slot that belongs to the wrong
  // day, moments before BookingFlow remounts (keyed by day) and silently
  // discards whatever that click just set.
  onNavigate?: () => void
}) {
  return (
    <fieldset className="m-0 border-0 p-0">
      <legend className="sr-only">Escolha o dia</legend>
      <div className="-mx-4 flex snap-x gap-2 overflow-x-auto px-4 pb-1">
        {days.map(({ date, hasSlots }) => {
          const isSelected = date === selectedDate
          return (
            <Link
              key={date}
              href={`/b/${slug}?servico=${serviceId}&data=${date}`}
              aria-current={isSelected ? 'date' : undefined}
              onClick={isSelected ? undefined : onNavigate}
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
