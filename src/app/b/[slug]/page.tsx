import { notFound } from 'next/navigation'
import { BookingFlow } from '@/components/booking/booking-flow'
import { getBusyRanges } from '@/db/queries/appointment'
import { getException, getWeeklyHours } from '@/db/queries/availability'
import { listActiveServices } from '@/db/queries/service'
import { getTenantBySlug } from '@/db/queries/tenant'
import { generateSlots } from '@/domain/slots'
import {
  addDays,
  localDate,
  localDateOf,
  toInstant,
  weekdayOf,
} from '@/domain/time'
import type { LocalDate, Slot, TimeRange } from '@/domain/types'
import { firstParam } from '@/lib/utils'

// How many days ahead the date strip shows. Clamped against the tenant's
// own maxAdvanceDays below — a tenant that only takes bookings a few days
// out never sees a strip full of dates it would reject anyway.
const DATE_STRIP_DAYS = 14
const LOCAL_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

// This is the public front door: an end customer with no account, likely on
// a phone, who will use this page exactly once. Step state (service, day)
// lives in the URL so Back works and a half-finished link can be shared —
// see src/components/booking/booking-flow.tsx for what deliberately does
// NOT live in the URL (the chosen time and the contact form).
export default async function BookingPage({
  params,
  searchParams,
}: PageProps<'/b/[slug]'>) {
  const { slug } = await params
  const query = await searchParams

  const tenant = await getTenantBySlug(slug)
  if (!tenant) notFound()

  const services = await listActiveServices(tenant.id)

  const now = new Date()
  const today = localDateOf(now, tenant.timezone)

  const serviceIdParam = firstParam(query.servico)
  const selectedService = serviceIdParam
    ? services.find((service) => service.id === serviceIdParam)
    : undefined

  // Every weekday, independent of the visible window's size, so a tenant
  // with a short maxAdvanceDays (and therefore a short date strip) still
  // gets a correct answer to "has this tenant configured any hours at all".
  const weeklyHoursByWeekday = new Map<number, TimeRange[]>()
  await Promise.all(
    [0, 1, 2, 3, 4, 5, 6].map(async (weekday) => {
      weeklyHoursByWeekday.set(
        weekday,
        await getWeeklyHours(tenant.id, weekday),
      )
    }),
  )
  const hasAnyWeeklyHours = Array.from(weeklyHoursByWeekday.values()).some(
    (hours) => hours.length > 0,
  )

  const windowDays = Math.max(
    1,
    Math.min(DATE_STRIP_DAYS, tenant.maxAdvanceDays + 1),
  )
  const dates: LocalDate[] = Array.from({ length: windowDays }, (_, i) =>
    addDays(today, i),
  )

  const dataParam = firstParam(query.data)
  const parsedDate =
    dataParam && LOCAL_DATE_PATTERN.test(dataParam)
      ? localDate(dataParam)
      : null
  // A `data` param outside the visible window (forged, or a stale link past
  // the tenant's own advance-booking horizon) falls back to today rather
  // than silently computing slots for a date the strip never shows.
  const selectedDate =
    parsedDate && dates.includes(parsedDate) ? parsedDate : today

  let dayOptions: { date: LocalDate; hasSlots: boolean }[] = []
  let slotsForSelectedDate: Slot[] = []

  if (selectedService && hasAnyWeeklyHours) {
    const rangeEnd =
      toInstant(addDays(today, windowDays), 0, tenant.timezone) ??
      new Date(now.getTime() + windowDays * 24 * 3600_000)
    const busy = await getBusyRanges(tenant.id, now, rangeEnd)
    const exceptions = await Promise.all(
      dates.map((date) => getException(tenant.id, date)),
    )

    const perDay = dates.map((date, i) => {
      const weekday = weekdayOf(date, tenant.timezone)
      const daySlots = generateSlots({
        date,
        timezone: tenant.timezone,
        weeklyHours: weeklyHoursByWeekday.get(weekday) ?? [],
        exception: exceptions[i] ?? null,
        service: {
          durationMinutes: selectedService.durationMinutes,
          bufferMinutes: selectedService.bufferMinutes,
        },
        busy,
        now,
        minNoticeMinutes: tenant.minNoticeMinutes,
        maxAdvanceDays: tenant.maxAdvanceDays,
      })
      return { date, slots: daySlots }
    })

    dayOptions = perDay.map(({ date, slots }) => ({
      date,
      hasSlots: slots.length > 0,
    }))
    slotsForSelectedDate =
      perDay.find(({ date }) => date === selectedDate)?.slots ?? []
  }

  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-6 px-4 py-6">
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-2xl font-semibold text-fg">
          {tenant.name}
        </h1>
        <p className="text-sm text-fg-muted">Agende seu horário online.</p>
      </header>

      <BookingFlow
        key={`${selectedService?.id ?? 'none'}-${selectedDate}`}
        slug={slug}
        tenantName={tenant.name}
        services={services}
        hasAnyWeeklyHours={hasAnyWeeklyHours}
        timezone={tenant.timezone}
        today={today}
        selectedDate={selectedDate}
        selectedService={selectedService}
        dayOptions={dayOptions}
        slots={slotsForSelectedDate}
      />
    </main>
  )
}
