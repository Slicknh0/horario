import { eq } from 'drizzle-orm'
import { describe, expect, test, vi } from 'vitest'
import { createTestDb } from './harness'

const { db } = await createTestDb()
vi.mock('@/db/client', () => ({ db }))

// bookAppointment sends a confirmation e-mail after the insert commits.
// Mocked so no test ever attempts a real network call, and so a failing
// send can be simulated without needing a real Resend account.
const sendConfirmationEmailMock = vi.fn().mockResolvedValue(undefined)
vi.mock('@/lib/email', () => ({
  sendConfirmationEmail: sendConfirmationEmailMock,
}))

const { bookAppointment } = await import('@/actions/book-appointment')
const { appointments, services, tenants, weeklyHours } = await import(
  '@/db/schema'
)
const { addDays, localDateOf, toInstant, weekdayOf } = await import(
  '@/domain/time'
)

const TIMEZONE = 'America/Sao_Paulo'

// Captured once at module load rather than hard-coded, so this suite never
// goes stale the way a literal future date eventually would: every slot
// below is derived from whatever "now" actually is when the suite runs.
const NOW = new Date()
const TODAY = localDateOf(NOW, TIMEZONE)
const TODAY_WEEKDAY = weekdayOf(TODAY, TIMEZONE)

function localMinuteOf(instant: Date): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: TIMEZONE,
    hour: 'numeric',
    minute: 'numeric',
    hourCycle: 'h23',
  }).formatToParts(instant)
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? 0)
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? 0)
  return hour * 60 + minute
}

// The next 15-minute-grid instant that is at least `afterMinutes` past NOW,
// on TODAY's local date. generateSlots steps in GRANULARITY_MINUTES (15)
// increments from the weekly_hours window's startMinute (0 below), so every
// candidate startsAt this suite books must land on that same grid.
function slotAfter(afterMinutes: number): Date {
  const target = new Date(NOW.getTime() + afterMinutes * 60_000)
  const minute = localMinuteOf(target)
  const roundedUp = Math.ceil(minute / 15) * 15
  const instant = toInstant(TODAY, roundedUp, TIMEZONE)
  if (!instant) throw new Error('DST gap in test fixture; pick another time')
  return instant
}

let tenantCounter = 0

// Creates a tenant with weekly_hours open all day (00:00-24:00) on today's
// weekday, plus one active service, so every test gets a clean, isolated
// fixture that generateSlots will actually produce slots for.
async function setupTenant(overrides?: { minNoticeMinutes?: number }) {
  tenantCounter += 1
  const slug = `agenda-${tenantCounter}`
  const [tenant] = await db
    .insert(tenants)
    .values({
      slug,
      name: `Tenant ${slug}`,
      timezone: TIMEZONE,
      minNoticeMinutes: overrides?.minNoticeMinutes ?? 120,
      maxAdvanceDays: 60,
    })
    .returning()
  if (!tenant) throw new Error('tenant insert returned no row')

  const [service] = await db
    .insert(services)
    .values({
      tenantId: tenant.id,
      name: 'Corte de cabelo',
      durationMinutes: 30,
      bufferMinutes: 10,
      priceCents: 5000,
    })
    .returning()
  if (!service) throw new Error('service insert returned no row')

  await db.insert(weeklyHours).values({
    tenantId: tenant.id,
    weekday: TODAY_WEEKDAY,
    startMinute: 0,
    endMinute: 24 * 60,
  })

  return { tenant, service }
}

const basePayload = {
  customerName: 'Cliente Teste',
  customerEmail: 'cliente@example.com',
  customerPhone: '11999999999',
}

describe('bookAppointment', () => {
  test('a valid booking inserts exactly one row, with blocked_until equal to ends_at + buffer', async () => {
    const { tenant, service } = await setupTenant()
    const startsAt = slotAfter(180) // well past the 120-minute default notice

    const result = await bookAppointment({
      slug: tenant.slug,
      serviceId: service.id,
      startsAt,
      ...basePayload,
    })

    expect(result?.data).toMatchObject({ ok: true })
    expect(typeof (result?.data as { token?: string })?.token).toBe('string')

    const rows = await db
      .select()
      .from(appointments)
      .where(eq(appointments.serviceId, service.id))
    expect(rows).toHaveLength(1)
    const row = rows[0]
    if (!row) throw new Error('expected one appointment row')
    expect(row.blockedUntil.getTime()).toBe(
      row.endsAt.getTime() + service.bufferMinutes * 60_000,
    )
    expect(sendConfirmationEmailMock).toHaveBeenCalledTimes(1)
  })

  test('rejects booking a service that was deactivated after the page loaded', async () => {
    const { tenant, service } = await setupTenant()
    const startsAt = slotAfter(180)

    await db
      .update(services)
      .set({ isActive: false })
      .where(eq(services.id, service.id))

    const result = await bookAppointment({
      slug: tenant.slug,
      serviceId: service.id,
      startsAt,
      ...basePayload,
    })

    expect(result?.data).toEqual({ ok: false, error: 'NOT_FOUND' })

    const rows = await db
      .select()
      .from(appointments)
      .where(eq(appointments.serviceId, service.id))
    expect(rows).toHaveLength(0)
  })

  test('two concurrent bookings for the same slot: one succeeds, the other returns SLOT_TAKEN without throwing', async () => {
    const { tenant, service } = await setupTenant()
    const startsAt = slotAfter(180)
    const payload = {
      slug: tenant.slug,
      serviceId: service.id,
      startsAt,
      ...basePayload,
    }

    // Issued together (not awaited one after the other) so both read the
    // same pre-write busy ranges and both pass the generateSlots recheck —
    // a sequential second call would instead see the first booking as busy
    // and get filtered out as OUTSIDE_HOURS before ever reaching the
    // insert. Only a genuine race reaches the database's exclusion
    // constraint, which is what isOverlapViolation exists to translate. If
    // it failed to recognize the constraint error, the losing call would
    // either throw (an unhandled rejection failing this test) or surface a
    // generic serverError instead of the structured result asserted below.
    const [first, second] = await Promise.all([
      bookAppointment(payload),
      bookAppointment(payload),
    ])

    const results = [first?.data, second?.data]
    expect(results).toContainEqual({ ok: true, token: expect.any(String) })
    expect(results).toContainEqual({ ok: false, error: 'SLOT_TAKEN' })

    const rows = await db
      .select()
      .from(appointments)
      .where(eq(appointments.serviceId, service.id))
    expect(rows).toHaveLength(1)
  })

  // Deterministic counterpart to the concurrent-race test above: the most
  // common real failure isn't two requests racing, it's one customer
  // filling in the contact form while the slot is still free and it being
  // taken by the time they submit. The action's pre-insert recheck (see
  // src/actions/book-appointment.ts) rejects a sequential second booking
  // for the same slot before the insert is ever attempted — that path must
  // report SLOT_TAKEN, not the false "shop is closed" of OUTSIDE_HOURS,
  // because the UI's recovery (reload the day's slots, stay on this step)
  // only fires for SLOT_TAKEN.
  test('booking the same slot twice sequentially returns SLOT_TAKEN on the second call, with no second row written', async () => {
    const { tenant, service } = await setupTenant()
    const startsAt = slotAfter(180)
    const payload = {
      slug: tenant.slug,
      serviceId: service.id,
      startsAt,
      ...basePayload,
    }

    const first = await bookAppointment(payload)
    expect(first?.data).toMatchObject({ ok: true })

    const second = await bookAppointment(payload)
    expect(second?.data).toEqual({ ok: false, error: 'SLOT_TAKEN' })

    const rows = await db
      .select()
      .from(appointments)
      .where(eq(appointments.serviceId, service.id))
    expect(rows).toHaveLength(1)
  })

  test('a startsAt outside the generated slot list is rejected with OUTSIDE_HOURS and writes no row', async () => {
    const { tenant, service } = await setupTenant()
    // Tomorrow has no weekly_hours row at all (only TODAY_WEEKDAY was
    // configured), so generateSlots produces nothing for it — any instant
    // on that date is a forged slot from the action's point of view.
    const tomorrow = addDays(TODAY, 1)
    const startsAt = toInstant(tomorrow, 600, TIMEZONE)
    if (!startsAt) throw new Error('DST gap in test fixture; pick another time')

    const result = await bookAppointment({
      slug: tenant.slug,
      serviceId: service.id,
      startsAt,
      ...basePayload,
    })

    expect(result?.data).toEqual({ ok: false, error: 'OUTSIDE_HOURS' })

    const rows = await db
      .select()
      .from(appointments)
      .where(eq(appointments.serviceId, service.id))
    expect(rows).toHaveLength(0)
  })

  // Distinct from the "no weekly_hours row at all" case above: this tenant
  // DOES take bookings that day (08:00-18:00), so the disambiguation in
  // book-appointment.ts must find nothing in the no-busy-ignored slot list
  // either, proving 03:00 was genuinely never bookable rather than merely
  // "not free right now". Time is pinned via fake timers rather than the
  // suite's real "NOW", since this test needs a specific, controlled
  // relationship between "now" and the configured opening window that
  // picking an offset from the real clock can't guarantee.
  test('a startsAt genuinely outside opening hours (03:00, before an 08:00 opening) is rejected with OUTSIDE_HOURS and writes no row', async () => {
    vi.useFakeTimers()
    try {
      // 03:30 UTC = 00:30 in America/Sao_Paulo (UTC-3, no DST since 2019).
      const pinnedNow = new Date('2026-01-08T03:30:00Z')
      vi.setSystemTime(pinnedNow)

      const pinnedToday = localDateOf(pinnedNow, TIMEZONE)
      const pinnedWeekday = weekdayOf(pinnedToday, TIMEZONE)

      tenantCounter += 1
      const slug = `agenda-hours-${tenantCounter}`
      const [tenant] = await db
        .insert(tenants)
        .values({
          slug,
          name: `Tenant ${slug}`,
          timezone: TIMEZONE,
          minNoticeMinutes: 120,
          maxAdvanceDays: 60,
        })
        .returning()
      if (!tenant) throw new Error('tenant insert returned no row')

      const [service] = await db
        .insert(services)
        .values({
          tenantId: tenant.id,
          name: 'Corte de cabelo',
          durationMinutes: 30,
          bufferMinutes: 10,
          priceCents: 5000,
        })
        .returning()
      if (!service) throw new Error('service insert returned no row')

      await db.insert(weeklyHours).values({
        tenantId: tenant.id,
        weekday: pinnedWeekday,
        startMinute: 8 * 60,
        endMinute: 18 * 60,
      })

      // 03:00 local: after the 120-minute notice window from 00:30, but
      // over four hours before the 08:00 opening.
      const startsAt = toInstant(pinnedToday, 3 * 60, TIMEZONE)
      if (!startsAt)
        throw new Error('DST gap in test fixture; pick another time')

      const result = await bookAppointment({
        slug: tenant.slug,
        serviceId: service.id,
        startsAt,
        ...basePayload,
      })

      expect(result?.data).toEqual({ ok: false, error: 'OUTSIDE_HOURS' })

      const rows = await db
        .select()
        .from(appointments)
        .where(eq(appointments.serviceId, service.id))
      expect(rows).toHaveLength(0)
    } finally {
      vi.useRealTimers()
    }
  })

  test('a booking inside min_notice_minutes is rejected with TOO_SOON', async () => {
    const { tenant, service } = await setupTenant({ minNoticeMinutes: 120 })
    const startsAt = new Date(NOW.getTime() + 30 * 60_000) // only 30 min out

    const result = await bookAppointment({
      slug: tenant.slug,
      serviceId: service.id,
      startsAt,
      ...basePayload,
    })

    expect(result?.data).toEqual({ ok: false, error: 'TOO_SOON' })

    const rows = await db
      .select()
      .from(appointments)
      .where(eq(appointments.serviceId, service.id))
    expect(rows).toHaveLength(0)
  })

  test('the honeypot field, when filled, writes no row', async () => {
    const { tenant, service } = await setupTenant()
    const startsAt = slotAfter(180)

    const result = await bookAppointment({
      slug: tenant.slug,
      serviceId: service.id,
      startsAt,
      ...basePayload,
      website: 'http://spam.example',
    })

    // Whether the bot-filled string is caught by the schema (max(0)) or by
    // the explicit in-body check, the observable guarantee is the same:
    // never a successful booking.
    expect((result?.data as { ok?: boolean } | undefined)?.ok).not.toBe(true)

    const rows = await db
      .select()
      .from(appointments)
      .where(eq(appointments.serviceId, service.id))
    expect(rows).toHaveLength(0)
  })

  test('the fourth future booking for the same phone on the same tenant is refused', async () => {
    const { tenant, service } = await setupTenant()
    const phone = '11988887777'

    // Spaced an hour apart: 30-minute duration + 10-minute buffer needs
    // only 40 minutes of clearance, so this never trips the overlap
    // constraint on its own.
    for (let i = 0; i < 3; i++) {
      const startsAt = slotAfter(180 + i * 60)
      const result = await bookAppointment({
        slug: tenant.slug,
        serviceId: service.id,
        startsAt,
        ...basePayload,
        customerPhone: phone,
      })
      expect(result?.data).toMatchObject({ ok: true })
    }

    const fourthStartsAt = slotAfter(180 + 3 * 60)
    const fourth = await bookAppointment({
      slug: tenant.slug,
      serviceId: service.id,
      startsAt: fourthStartsAt,
      ...basePayload,
      customerPhone: phone,
    })
    expect(fourth?.data).toEqual({ ok: false, error: 'NOT_FOUND' })

    const rows = await db
      .select()
      .from(appointments)
      .where(eq(appointments.customerPhone, phone))
    expect(rows).toHaveLength(3)
    expect(
      rows.some((r) => r.startsAt.getTime() === fourthStartsAt.getTime()),
    ).toBe(false)
  })
})
