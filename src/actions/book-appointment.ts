'use server'

import { randomBytes } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { db } from '@/db/client'
import { countFutureByPhone, getBusyRanges } from '@/db/queries/appointment'
import { getException, getWeeklyHours } from '@/db/queries/availability'
import { getServiceForBooking } from '@/db/queries/service'
import { getTenantBySlug } from '@/db/queries/tenant'
import { appointments } from '@/db/schema'
import { validateBookingWindow } from '@/domain/booking-window'
import { generateSlots } from '@/domain/slots'
import { localDateOf, weekdayOf } from '@/domain/time'
import { sendConfirmationEmail } from '@/lib/email'
import { publicAction } from '@/lib/safe-action'

// A tenant/service that no longer exists, or a service that was deactivated
// after the page loaded, both fail closed as NOT_FOUND — the customer never
// learns which case it was, and no row is ever written for either.
const MAX_FUTURE_BOOKINGS_PER_PHONE = 3

const input = z.object({
  slug: z.string(),
  serviceId: z.string().uuid(),
  startsAt: z.coerce.date(),
  customerName: z.string().min(2).max(80),
  customerEmail: z.string().email(),
  customerPhone: z.string().min(10).max(20),
  // Honeypot: real customers never see or fill this field (hidden from the
  // form), so any non-empty value means the submitter is a bot. Failing
  // closed as NOT_FOUND rather than a dedicated error code tells an
  // automated submitter nothing about why it was rejected.
  website: z.string().max(0).optional(),
})

export const bookAppointment = publicAction
  .inputSchema(input)
  .action(async ({ parsedInput }) => {
    if (parsedInput.website)
      return { ok: false as const, error: 'NOT_FOUND' as const }

    const tenant = await getTenantBySlug(parsedInput.slug)
    if (!tenant) return { ok: false as const, error: 'NOT_FOUND' as const }

    const service = await getServiceForBooking(tenant.id, parsedInput.serviceId)
    if (!service) return { ok: false as const, error: 'NOT_FOUND' as const }

    const now = new Date()
    const window = validateBookingWindow({
      startsAt: parsedInput.startsAt,
      now,
      timezone: tenant.timezone,
      minNoticeMinutes: tenant.minNoticeMinutes,
      maxAdvanceDays: tenant.maxAdvanceDays,
    })
    if (!window.ok) return { ok: false as const, error: window.error }

    const phoneCount = await countFutureByPhone(
      tenant.id,
      parsedInput.customerPhone,
      now,
    )
    if (phoneCount >= MAX_FUTURE_BOOKINGS_PER_PHONE) {
      return { ok: false as const, error: 'NOT_FOUND' as const }
    }

    // Re-derives the full slot list from the same pure function and the
    // same live data the page rendered from, rather than trusting the
    // client's chosen startsAt directly — a forged instant (outside opening
    // hours, inside a since-taken slot, etc.) never reaches the insert.
    const date = localDateOf(parsedInput.startsAt, tenant.timezone)
    const dayStart = new Date(parsedInput.startsAt.getTime() - 24 * 3600_000)
    const dayEnd = new Date(parsedInput.startsAt.getTime() + 24 * 3600_000)

    const weeklyHours = await getWeeklyHours(
      tenant.id,
      weekdayOf(date, tenant.timezone),
    )
    const exception = await getException(tenant.id, date)
    const serviceDuration = {
      durationMinutes: service.durationMinutes,
      bufferMinutes: service.bufferMinutes,
    }

    const slots = generateSlots({
      date,
      timezone: tenant.timezone,
      weeklyHours,
      exception,
      service: serviceDuration,
      busy: await getBusyRanges(tenant.id, dayStart, dayEnd),
      now,
      minNoticeMinutes: tenant.minNoticeMinutes,
      maxAdvanceDays: tenant.maxAdvanceDays,
    })

    const target = parsedInput.startsAt.getTime()
    if (!slots.some((s) => s.startsAt.getTime() === target)) {
      // Not available right now — but "not available" has two very
      // different causes, and the customer needs them told apart. The
      // common case is someone who filled in the form while the slot was
      // still free and it got taken out from under them while they typed;
      // telling them the shop is "outside opening hours" is false and
      // leaves them with no idea that a different time would work.
      //
      // Re-running with no busy intervals answers "would the shop's hours,
      // exceptions and this service's duration ever have allowed this
      // instant, ignoring what's already booked?". If yes, it was a
      // legitimate slot someone else just took — SLOT_TAKEN, which the UI
      // already recovers from by reloading the day's slots and keeping the
      // customer on this step. If no, it was never bookable at all
      // (forged, or truly outside opening hours) — OUTSIDE_HOURS.
      const slotsIgnoringBusy = generateSlots({
        date,
        timezone: tenant.timezone,
        weeklyHours,
        exception,
        service: serviceDuration,
        busy: [],
        now,
        minNoticeMinutes: tenant.minNoticeMinutes,
        maxAdvanceDays: tenant.maxAdvanceDays,
      })
      const wasLegitimateSlot = slotsIgnoringBusy.some(
        (s) => s.startsAt.getTime() === target,
      )
      return {
        ok: false as const,
        error: wasLegitimateSlot
          ? ('SLOT_TAKEN' as const)
          : ('OUTSIDE_HOURS' as const),
      }
    }

    const cancelToken = randomBytes(24).toString('base64url')
    const endsAt = new Date(target + service.durationMinutes * 60_000)
    const blockedUntil = new Date(
      endsAt.getTime() + service.bufferMinutes * 60_000,
    )

    try {
      await db.insert(appointments).values({
        tenantId: tenant.id,
        serviceId: service.id,
        customerName: parsedInput.customerName,
        customerEmail: parsedInput.customerEmail,
        customerPhone: parsedInput.customerPhone,
        startsAt: parsedInput.startsAt,
        endsAt,
        blockedUntil,
        serviceName: service.name,
        durationMinutes: service.durationMinutes,
        bufferMinutes: service.bufferMinutes,
        priceCents: service.priceCents,
        cancelToken,
      })
    } catch (error) {
      if (isOverlapViolation(error))
        return { ok: false as const, error: 'SLOT_TAKEN' as const }
      throw error
    }

    // After commit. A failed e-mail must never undo a booking — the
    // confirmation screen shows the same management link regardless, so
    // losing the e-mail loses a convenience, never the booking itself.
    await sendConfirmationEmail({
      to: parsedInput.customerEmail,
      tenantName: tenant.name,
      serviceName: service.name,
      startsAt: parsedInput.startsAt,
      timezone: tenant.timezone,
      cancelToken,
    }).catch((e) =>
      console.error('confirmation email failed', { cancelToken, e }),
    )

    // The owner's agenda (src/app/app/page.tsx) reads listAppointmentsBetween
    // through a cached Server Component render — without this, a booking
    // made seconds ago would not show up until something else happened to
    // revalidate that path.
    revalidatePath('/app')

    // next-safe-action explicitly detects and re-throws Next.js navigation
    // errors (see node_modules/next-safe-action/dist/index.mjs,
    // isNavigationError) rather than swallowing them as a server error, so
    // this reaches the browser as a real navigation — the same guarantee a
    // plain <form action> redirect gets, without BookingFlow ever holding
    // the token in client state (a page reload used to lose it entirely;
    // see the class comment on ConfirmadoPage). `redirect` has return type
    // `never`, so nothing after this line is reachable.
    redirect(
      `/b/${parsedInput.slug}/confirmado?token=${encodeURIComponent(cancelToken)}`,
    )
  })

// Drizzle wraps driver errors in DrizzleQueryError, so the SQLSTATE lives on
// `.cause`, not at the top level. Walk the cause chain rather than assuming
// a depth (see tests/db/constraint.test.ts for the raw shape).
function isOverlapViolation(error: unknown): boolean {
  let current: unknown = error
  for (
    let depth = 0;
    depth < 5 && current !== null && typeof current === 'object';
    depth++
  ) {
    const e = current as {
      code?: string
      constraint_name?: string
      constraint?: string
      cause?: unknown
    }
    if (
      e.code === '23P01' &&
      (e.constraint_name ?? e.constraint) === 'appointment_no_overlap'
    ) {
      return true
    }
    current = e.cause
  }
  return false
}
