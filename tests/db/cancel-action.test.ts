import { eq } from 'drizzle-orm'
import { afterAll, describe, expect, test, vi } from 'vitest'
import { createTestDb } from './harness'

const { db } = await createTestDb()
vi.mock('@/db/client', () => ({ db }))

// Both bookAppointment (to create the appointment we then cancel) and
// cancelAppointment send/rely on nothing e-mail-related, but
// bookAppointment always fires sendConfirmationEmail after commit — mocked
// so this suite never attempts a real network call.
const sendConfirmationEmailMock = vi.fn().mockResolvedValue(undefined)
vi.mock('@/lib/email', () => ({
  sendConfirmationEmail: sendConfirmationEmailMock,
}))

const { bookAppointment } = await import('@/actions/book-appointment')
const { cancelAppointment } = await import('@/actions/cancel-appointment')
const { appointments, services, tenants, weeklyHours } = await import(
  '@/db/schema'
)
const { localDateOf, toInstant, weekdayOf } = await import('@/domain/time')

const TIMEZONE = 'America/Sao_Paulo'

// Pinned rather than read from the real wall clock: bookAppointment's own
// server-side `now = new Date()` (src/actions/book-appointment.ts) has to
// agree with the NOW this suite derives its slots from, so the fake clock
// stays set for the whole file (see tests/db/booking-action.test.ts for the
// same fix and the fuller rationale). Un-pinned, slotAfter(180) — three
// hours out — could roll past midnight into an invalid minute whenever the
// suite happened to run late in the evening. 2026-03-02T09:00:00Z is
// 06:00 in America/Sao_Paulo (UTC-3, no DST since 2019), early enough that
// a three-hour offset stays well inside the same local day.
const PINNED_NOW = new Date('2026-03-02T09:00:00Z')
vi.useFakeTimers()
vi.setSystemTime(PINNED_NOW)

afterAll(() => {
  vi.useRealTimers()
})

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

// The next 15-minute-grid instant at least `afterMinutes` past NOW, on
// TODAY's local date — same grid generateSlots steps on, so every startsAt
// this suite books through the real action lands on a slot it actually
// generates.
function slotAfter(afterMinutes: number): Date {
  const target = new Date(NOW.getTime() + afterMinutes * 60_000)
  const minute = localMinuteOf(target)
  const roundedUp = Math.ceil(minute / 15) * 15
  const instant = toInstant(TODAY, roundedUp, TIMEZONE)
  if (!instant) throw new Error('DST gap in test fixture; pick another time')
  return instant
}

let tenantCounter = 0

// Tenant open all day today, one active service — mirrors
// tests/db/booking-action.test.ts's fixture so both suites exercise the
// same real generateSlots path rather than hand-inserting rows.
async function setupTenant(overrides?: { minNoticeMinutes?: number }) {
  tenantCounter += 1
  const slug = `agenda-cancel-${tenantCounter}`
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

// Books through the real action (not a hand-rolled insert) so the token
// this suite cancels is the same shape and provenance a real customer's
// would be, and returns it alongside the chosen startsAt for reuse.
async function bookAndGetToken(
  tenant: { slug: string },
  service: { id: string },
  startsAt: Date,
) {
  const result = await bookAppointment({
    slug: tenant.slug,
    serviceId: service.id,
    startsAt,
    ...basePayload,
  })
  const data = result?.data as { ok: true; token: string } | undefined
  if (!data?.ok) throw new Error('setup booking failed unexpectedly')
  return data.token
}

describe('cancelAppointment', () => {
  test('a valid token cancels: status becomes cancelled and cancelled_at is set', async () => {
    const { tenant, service } = await setupTenant()
    const startsAt = slotAfter(180) // well past the 120-minute default notice
    const token = await bookAndGetToken(tenant, service, startsAt)

    const result = await cancelAppointment({ token })
    expect(result?.data).toEqual({ ok: true })

    const [row] = await db
      .select()
      .from(appointments)
      .where(eq(appointments.cancelToken, token))
    if (!row) throw new Error('expected the appointment row to still exist')
    expect(row.status).toBe('cancelled')
    expect(row.cancelledAt).not.toBeNull()
  })

  // The most valuable test in the file: proves ruling 3 from the task
  // brief — the appointment_no_overlap exclusion constraint is partial on
  // status = 'confirmed', so cancelling is the *entire* "free the slot"
  // operation. If cancelAppointment ever needed a second step to release
  // the slot, this is the test that would catch its absence.
  test('the freed slot is genuinely bookable again after cancelling', async () => {
    const { tenant, service } = await setupTenant()
    const startsAt = slotAfter(180)
    const token = await bookAndGetToken(tenant, service, startsAt)

    const cancelResult = await cancelAppointment({ token })
    expect(cancelResult?.data).toEqual({ ok: true })

    const rebooked = await bookAppointment({
      slug: tenant.slug,
      serviceId: service.id,
      startsAt,
      ...basePayload,
    })
    expect(rebooked?.data).toMatchObject({ ok: true })

    const rows = await db
      .select()
      .from(appointments)
      .where(eq(appointments.serviceId, service.id))
    expect(rows).toHaveLength(2)
    expect(rows.filter((r) => r.status === 'confirmed')).toHaveLength(1)
    expect(rows.filter((r) => r.status === 'cancelled')).toHaveLength(1)
  })

  test('cancelling twice returns ALREADY_CANCELLED on the second call, without throwing', async () => {
    const { tenant, service } = await setupTenant()
    const startsAt = slotAfter(180)
    const token = await bookAndGetToken(tenant, service, startsAt)

    const first = await cancelAppointment({ token })
    expect(first?.data).toEqual({ ok: true })

    const second = await cancelAppointment({ token })
    expect(second?.data).toEqual({ ok: false, error: 'ALREADY_CANCELLED' })

    const [row] = await db
      .select()
      .from(appointments)
      .where(eq(appointments.cancelToken, token))
    if (!row) throw new Error('expected the appointment row to still exist')
    expect(row.status).toBe('cancelled')
  })

  test('a token inside min_notice_minutes returns TOO_LATE_TO_CANCEL and leaves the row confirmed', async () => {
    const { tenant, service } = await setupTenant({ minNoticeMinutes: 120 })
    // Booked with plenty of notice (180 min > 120 min minimum) so the
    // booking itself succeeds...
    const startsAt = slotAfter(180)
    const token = await bookAndGetToken(tenant, service, startsAt)

    // ...then time advances to inside the 120-minute cancellation window:
    // only 10 minutes remain before startsAt. The clock is already fake
    // (pinned to PINNED_NOW at module load, see above) for the whole file,
    // so this only moves the system time to a second instant and moves it
    // back — never drops to the real clock, which would unpin every test
    // that runs after this one.
    try {
      vi.setSystemTime(new Date(startsAt.getTime() - 10 * 60_000))

      const result = await cancelAppointment({ token })
      expect(result?.data).toEqual({
        ok: false,
        error: 'TOO_LATE_TO_CANCEL',
      })
    } finally {
      vi.setSystemTime(PINNED_NOW)
    }

    const [row] = await db
      .select()
      .from(appointments)
      .where(eq(appointments.cancelToken, token))
    if (!row) throw new Error('expected the appointment row to still exist')
    expect(row.status).toBe('confirmed')
    expect(row.cancelledAt).toBeNull()
  })

  test('an unknown token fails closed, and the failure carries no tenant or appointment identifiers', async () => {
    const { tenant, service } = await setupTenant()
    // A real appointment exists in the database (with real ids) so that if
    // the failure ever DID leak an identifier, this test would catch it —
    // an empty database proves nothing here.
    const startsAt = slotAfter(180)
    await bookAndGetToken(tenant, service, startsAt)

    const result = await cancelAppointment({ token: 'not-a-real-token-at-all' })

    // tokenAction throws NOT_FOUND for an unmatched token; next-safe-action's
    // default handleServerError collapses any thrown error into a fixed,
    // generic message — never `result.data` — so this is both "fails
    // closed" and "carries nothing app-specific" in one assertion.
    expect(result?.data).toBeUndefined()
    expect(result?.serverError).toBeDefined()

    const serialized = JSON.stringify(result)
    expect(serialized).not.toMatch(/tenant/i)
    expect(serialized).not.toMatch(/appointment/i)
    expect(serialized).not.toContain(tenant.id)
    expect(serialized).not.toContain(service.id)
  })
})
