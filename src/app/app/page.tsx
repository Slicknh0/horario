import type { Route } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { AgendaDay } from '@/components/agenda/agenda-day'
import { AgendaWeek, type AgendaWeekDay } from '@/components/agenda/agenda-week'
import { ChevronLeftIcon, ChevronRightIcon } from '@/components/icons'
import { listAppointmentsBetween } from '@/db/queries/appointment'
import { listWeeklyHours } from '@/db/queries/availability'
import { getTenantById } from '@/db/queries/tenant'
import type { AgendaAppointment } from '@/domain/agenda'
import {
  addDays,
  localDate,
  localDateOf,
  toInstant,
  weekdayOf,
} from '@/domain/time'
import type { LocalDate } from '@/domain/types'
import { getSession } from '@/lib/auth'
import { env } from '@/lib/env'
import { cn, firstParam } from '@/lib/utils'

const LOCAL_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const WEEK_VIEW_DAYS = 7

// The panel's home page: the shop owner's most frequent screen, read
// standing at a counter between customers. Day and view (?data=, ?view=)
// live in the URL rather than client state — the same reasoning
// src/app/b/[slug]/page.tsx uses for its own step state — so a bookmarked
// or shared link to "next Tuesday" or "semana" round-trips correctly and
// Back/Forward behave the way the rest of the app already does.
export default async function AgendaPage({ searchParams }: PageProps<'/app'>) {
  const session = await getSession()
  const tenantId = session?.user.tenantId
  if (!tenantId) redirect('/login')

  const tenant = await getTenantById(tenantId)
  if (!tenant) redirect('/login')

  const query = await searchParams
  const view = firstParam(query.view) === 'semana' ? 'semana' : 'dia'

  const now = new Date()
  const today = localDateOf(now, tenant.timezone)
  const dateParam = firstParam(query.data)
  const selectedDate: LocalDate =
    dateParam && LOCAL_DATE_PATTERN.test(dateParam)
      ? localDate(dateParam)
      : today

  const publicUrl = `${env.NEXT_PUBLIC_APP_URL}/b/${tenant.slug}`

  // typedRoutes (next.config.ts) only validates a literal `href` string or
  // one that's a template literal built entirely from other literal types
  // — a plain `string` return type (what these two would infer without the
  // cast) doesn't structurally match `Route`, per Next's own documented
  // pattern for this exact case (non-literal hrefs need `as Route`).
  function dayHref(date: LocalDate): Route {
    return `/app?data=${date}` as Route
  }
  function weekHref(date: LocalDate): Route {
    return `/app?view=semana&data=${date}` as Route
  }

  if (view === 'semana') {
    const dates: LocalDate[] = Array.from({ length: WEEK_VIEW_DAYS }, (_, i) =>
      addDays(selectedDate, i),
    )
    const weeklyHoursByWeekday = await listWeeklyHours(tenantId)

    const days: AgendaWeekDay[] = dates.map((date) => {
      const dayStart = toInstant(date, 0, tenant.timezone) ?? now
      const nextDay = addDays(date, 1)
      const dayEnd = toInstant(nextDay, 0, tenant.timezone) ?? now
      const weekday = weekdayOf(date, tenant.timezone)
      return {
        dayStart,
        dayEnd,
        weeklyHours: weeklyHoursByWeekday[weekday] ?? [],
        isToday: date === today,
      }
    })

    const firstDay = dates[0] ?? today
    const lastDay = dates[dates.length - 1] ?? today
    const rangeStart = toInstant(firstDay, 0, tenant.timezone) ?? now
    const rangeEndDate = addDays(lastDay, 1)
    const rangeEnd = toInstant(rangeEndDate, 0, tenant.timezone) ?? now

    const rows = await listAppointmentsBetween(tenantId, rangeStart, rangeEnd)
    const appointments: AgendaAppointment[] = rows.map(toAgendaAppointment)

    return (
      <div className="flex flex-col gap-6">
        <AgendaHeader
          view={view}
          selectedDate={selectedDate}
          today={today}
          timezone={tenant.timezone}
          dayHref={dayHref}
          weekHref={weekHref}
        />
        <AgendaWeek
          timezone={tenant.timezone}
          days={days}
          appointments={appointments}
          publicUrl={publicUrl}
        />
      </div>
    )
  }

  const weekday = weekdayOf(selectedDate, tenant.timezone)
  const weeklyHoursByWeekday = await listWeeklyHours(tenantId)
  const weeklyHours = weeklyHoursByWeekday[weekday] ?? []

  const dayStart = toInstant(selectedDate, 0, tenant.timezone) ?? now
  const nextDate = addDays(selectedDate, 1)
  const dayEnd = toInstant(nextDate, 0, tenant.timezone) ?? now

  const rows = await listAppointmentsBetween(tenantId, dayStart, dayEnd)
  const appointments: AgendaAppointment[] = rows.map(toAgendaAppointment)

  return (
    <div className="flex flex-col gap-6">
      <AgendaHeader
        view={view}
        selectedDate={selectedDate}
        today={today}
        timezone={tenant.timezone}
        dayHref={dayHref}
        weekHref={weekHref}
      />
      <AgendaDay
        timezone={tenant.timezone}
        dayStart={dayStart}
        dayEnd={dayEnd}
        weeklyHours={weeklyHours}
        appointments={appointments}
        publicUrl={publicUrl}
      />
    </div>
  )
}

function toAgendaAppointment(row: {
  id: string
  customerName: string
  customerPhone: string
  serviceName: string
  durationMinutes: number
  bufferMinutes: number
  priceCents: number
  startsAt: Date
  endsAt: Date
  blockedUntil: Date
  status: AgendaAppointment['status']
}): AgendaAppointment {
  // A deliberately narrow projection: never forwards tenantId, cancelToken
  // or customerEmail to the client bundle, and every field it does keep is
  // the row's own snapshot (never re-derived from the service table).
  return {
    id: row.id,
    customerName: row.customerName,
    customerPhone: row.customerPhone,
    serviceName: row.serviceName,
    durationMinutes: row.durationMinutes,
    bufferMinutes: row.bufferMinutes,
    priceCents: row.priceCents,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    blockedUntil: row.blockedUntil,
    status: row.status,
  }
}

function AgendaHeader({
  view,
  selectedDate,
  today,
  timezone,
  dayHref,
  weekHref,
}: {
  view: 'dia' | 'semana'
  selectedDate: LocalDate
  today: LocalDate
  timezone: string
  dayHref: (date: LocalDate) => Route
  weekHref: (date: LocalDate) => Route
}) {
  const headingInstant = toInstant(selectedDate, 12 * 60, timezone)
  const heading = headingInstant
    ? new Intl.DateTimeFormat('pt-BR', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        timeZone: timezone,
      }).format(headingInstant)
    : selectedDate

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold text-fg">
            Agenda
          </h1>
          <p className="text-sm capitalize text-fg-muted">{heading}</p>
        </div>

        <nav
          aria-label="Alternar visão da agenda"
          className="flex items-center gap-1 rounded-md border border-border bg-surface-raised p-1"
        >
          <Link
            href={dayHref(selectedDate)}
            aria-current={view === 'dia' ? 'page' : undefined}
            className={cn(
              'rounded-sm px-3 py-1 text-sm font-medium transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface-raised',
              view === 'dia'
                ? 'bg-surface text-accent'
                : 'text-fg-muted hover:text-fg',
            )}
          >
            Dia
          </Link>
          <Link
            href={weekHref(selectedDate)}
            aria-current={view === 'semana' ? 'page' : undefined}
            className={cn(
              'rounded-sm px-3 py-1 text-sm font-medium transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface-raised',
              view === 'semana'
                ? 'bg-surface text-accent'
                : 'text-fg-muted hover:text-fg',
            )}
          >
            Semana
          </Link>
        </nav>
      </div>

      <div className="flex items-center gap-1">
        <Link
          href={
            view === 'semana'
              ? weekHref(addDays(selectedDate, -WEEK_VIEW_DAYS))
              : dayHref(addDays(selectedDate, -1))
          }
          aria-label={view === 'semana' ? 'Semana anterior' : 'Dia anterior'}
          className={cn(
            'inline-flex size-8 items-center justify-center rounded-md border border-border text-fg-muted transition-colors',
            'hover:bg-surface-raised hover:text-fg',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
          )}
        >
          <ChevronLeftIcon className="size-4" />
        </Link>
        <Link
          href={view === 'semana' ? weekHref(today) : dayHref(today)}
          className={cn(
            'inline-flex h-8 items-center justify-center rounded-md border border-border px-3 text-sm font-medium text-fg-muted transition-colors',
            'hover:bg-surface-raised hover:text-fg',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
          )}
        >
          Hoje
        </Link>
        <Link
          href={
            view === 'semana'
              ? weekHref(addDays(selectedDate, WEEK_VIEW_DAYS))
              : dayHref(addDays(selectedDate, 1))
          }
          aria-label={view === 'semana' ? 'Próxima semana' : 'Próximo dia'}
          className={cn(
            'inline-flex size-8 items-center justify-center rounded-md border border-border text-fg-muted transition-colors',
            'hover:bg-surface-raised hover:text-fg',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
          )}
        >
          <ChevronRightIcon className="size-4" />
        </Link>
      </div>
    </div>
  )
}
