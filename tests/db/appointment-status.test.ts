import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { createTestDb } from './harness'

const { db } = await createTestDb()
vi.mock('@/db/client', () => ({ db }))

// setAppointmentStatus reads the session through src/lib/auth.ts's
// getSession, the same way createService/updateService/setServiceActive do
// in tests/db/service.test.ts — mocking it lets each test act as whichever
// tenant it needs, never deriving ctx.tenantId from anything the test
// passes as input.
const getSessionMock = vi.fn()
vi.mock('@/lib/auth', () => ({ getSession: getSessionMock }))

// revalidatePath requires a live Next.js request/render store, which does
// not exist in this test process (see tests/db/service.test.ts for the
// identical need).
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

// bookAppointment (used here to create the appointments this suite then
// transitions, and to prove ruling 4 by rebooking a freed slot) always
// fires sendConfirmationEmail after commit — mocked so this suite never
// attempts a real network call.
const sendConfirmationEmailMock = vi.fn().mockResolvedValue(undefined)
vi.mock('@/lib/email', () => ({
  sendConfirmationEmail: sendConfirmationEmailMock,
}))

const { setAppointmentStatus } = await import('@/actions/appointment-status')
const { bookAppointment } = await import('@/actions/book-appointment')
const { listAppointmentsBetween } = await import('@/db/queries/appointment')
const { appointments, services, tenants, weeklyHours } = await import(
  '@/db/schema'
)
const { localDateOf, toInstant, weekdayOf } = await import('@/domain/time')

const TIMEZONE = 'America/Sao_Paulo'

// Captured once at module load, not hard-coded, so this suite never goes
// stale the way a literal future date eventually would (same reasoning as
// tests/db/booking-action.test.ts and tests/db/cancel-action.test.ts).
const NOW = new Date()
const TODAY = localDateOf(NOW, TIMEZONE)
const TODAY_WEEKDAY = weekdayOf(TODAY, TIMEZONE)

function signInAs(tenantId: string) {
  getSessionMock.mockResolvedValue({
    user: { id: `user-${tenantId}`, tenantId },
  })
}

beforeEach(() => {
  getSessionMock.mockReset()
})

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
// this suite books through the real bookAppointment action lands on a slot
// it actually generates.
function slotAfter(afterMinutes: number): Date {
  const target = new Date(NOW.getTime() + afterMinutes * 60_000)
  const minute = localMinuteOf(target)
  const roundedUp = Math.ceil(minute / 15) * 15
  const instant = toInstant(TODAY, roundedUp, TIMEZONE)
  if (!instant) throw new Error('DST gap in test fixture; pick another time')
  return instant
}

let tenantCounter = 0

// Tenant open all day today, one active service — the same fixture shape
// as booking-action.test.ts and cancel-action.test.ts, so this suite
// exercises the real generateSlots path bookAppointment relies on rather
// than hand-inserting rows for setup.
async function setupTenant() {
  tenantCounter += 1
  const slug = `agenda-status-${tenantCounter}`
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

// Books through the real action (not a hand-rolled insert) so every
// appointment this suite transitions has the same shape and provenance a
// real booking would, and returns the full row so callers can compare it
// whole later.
async function bookAndGetRow(
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

  const [row] = await db
    .select()
    .from(appointments)
    .where(eq(appointments.cancelToken, data.token))
  if (!row) throw new Error('expected the booked appointment row to exist')
  return row
}

describe('setAppointmentStatus', () => {
  test('completed sets the status and leaves cancelled_at null', async () => {
    const { tenant, service } = await setupTenant()
    const startsAt = slotAfter(180) // well past the 120-minute default notice
    const appointment = await bookAndGetRow(tenant, service, startsAt)
    signInAs(tenant.id)

    const result = await setAppointmentStatus({
      id: appointment.id,
      status: 'completed',
    })
    expect(result?.data).toEqual({ ok: true })

    const [row] = await db
      .select()
      .from(appointments)
      .where(eq(appointments.id, appointment.id))
    if (!row) throw new Error('expected the appointment row to still exist')
    expect(row.status).toBe('completed')
    expect(row.cancelledAt).toBeNull()
  })

  test('no_show sets the status and leaves cancelled_at null', async () => {
    const { tenant, service } = await setupTenant()
    const startsAt = slotAfter(180)
    const appointment = await bookAndGetRow(tenant, service, startsAt)
    signInAs(tenant.id)

    const result = await setAppointmentStatus({
      id: appointment.id,
      status: 'no_show',
    })
    expect(result?.data).toEqual({ ok: true })

    const [row] = await db
      .select()
      .from(appointments)
      .where(eq(appointments.id, appointment.id))
    if (!row) throw new Error('expected the appointment row to still exist')
    expect(row.status).toBe('no_show')
    expect(row.cancelledAt).toBeNull()
  })

  test('cancelled sets the status and stamps cancelled_at', async () => {
    const { tenant, service } = await setupTenant()
    const startsAt = slotAfter(180)
    const appointment = await bookAndGetRow(tenant, service, startsAt)
    signInAs(tenant.id)

    const result = await setAppointmentStatus({
      id: appointment.id,
      status: 'cancelled',
    })
    expect(result?.data).toEqual({ ok: true })

    const [row] = await db
      .select()
      .from(appointments)
      .where(eq(appointments.id, appointment.id))
    if (!row) throw new Error('expected the appointment row to still exist')
    expect(row.status).toBe('cancelled')
    expect(row.cancelledAt).not.toBeNull()
  })

  // The most valuable test in this file: proves ruling 4 — the
  // appointment_no_overlap exclusion constraint is partial on
  // status = 'confirmed', so moving a row to no_show is the *entire*
  // "free the slot" operation, with no separate release step. If
  // setAppointmentStatus ever needed a second step to release the slot,
  // this is the test that would catch its absence — exactly the same
  // reasoning tests/db/cancel-action.test.ts applies to the customer-facing
  // cancel path.
  test('after marking no_show, that exact slot is bookable again via bookAppointment', async () => {
    const { tenant, service } = await setupTenant()
    const startsAt = slotAfter(180)
    const appointment = await bookAndGetRow(tenant, service, startsAt)
    signInAs(tenant.id)

    const statusResult = await setAppointmentStatus({
      id: appointment.id,
      status: 'no_show',
    })
    expect(statusResult?.data).toEqual({ ok: true })

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
    expect(rows.filter((r) => r.status === 'no_show')).toHaveLength(1)
    expect(rows.filter((r) => r.status === 'confirmed')).toHaveLength(1)
  })

  // Proves the tenantId predicate in appointment-status.ts's WHERE clause
  // is the entire authorization check: signed in as tenant B, supplying
  // tenant A's real appointment id changes zero rows. The action still
  // reports { ok: true } (it never distinguishes "updated a row" from
  // "matched nothing"), so the only observable proof is reading tenant A's
  // row back and comparing it whole against what it was before the call —
  // not just checking one field, since a bug that changed some other
  // column would pass a narrower assertion.
  test("an action carrying another tenant's appointment id changes nothing", async () => {
    const { tenant: tenantA, service: serviceA } = await setupTenant()
    const { tenant: tenantB } = await setupTenant()
    const startsAt = slotAfter(180)
    const before = await bookAndGetRow(tenantA, serviceA, startsAt)

    signInAs(tenantB.id)
    const result = await setAppointmentStatus({
      id: before.id,
      status: 'cancelled',
    })
    expect(result?.data).toEqual({ ok: true })

    const [after] = await db
      .select()
      .from(appointments)
      .where(eq(appointments.id, before.id))
    if (!after) throw new Error('expected tenant A appointment to still exist')
    expect(after).toEqual(before)
  })
})

describe('listAppointmentsBetween', () => {
  // Guards the corrected predicate against regression: an appointment that
  // began the day before the query window but whose blocked_until reaches
  // into it must still appear, the same true interval-overlap semantics
  // tests/db/appointment.test.ts already proves for getBusyRanges. This is
  // the query the agenda page itself calls, so it needs its own coverage —
  // a `between(startsAt, from, to)` filter would miss this row entirely.
  test('returns an appointment that started before the window and runs into it', async () => {
    const [tenant] = await db
      .insert(tenants)
      .values({ slug: 'agenda-overlap-teste', name: 'Overlap Teste' })
      .returning()
    const tenantId = tenant?.id
    if (!tenantId) throw new Error('tenant insert returned no row')

    const [service] = await db
      .insert(services)
      .values({
        tenantId,
        name: 'Corte',
        durationMinutes: 30,
        bufferMinutes: 10,
        priceCents: 5000,
      })
      .returning()
    const serviceId = service?.id
    if (!serviceId) throw new Error('service insert returned no row')

    // Starts the day before the agenda's query window. With the 10-minute
    // buffer, blocked_until reaches 00:30 the next day — inside the
    // window — even though startsAt itself falls outside it.
    const startsAt = new Date('2026-03-09T23:50:00Z')
    const endsAt = new Date('2026-03-10T00:20:00Z')
    const blockedUntil = new Date('2026-03-10T00:30:00Z')

    const [inserted] = await db
      .insert(appointments)
      .values({
        tenantId,
        serviceId,
        status: 'confirmed',
        customerName: 'Cliente',
        customerEmail: 'c@ex.com',
        customerPhone: '11999999999',
        startsAt,
        endsAt,
        blockedUntil,
        serviceName: 'Corte',
        durationMinutes: 30,
        bufferMinutes: 10,
        priceCents: 5000,
        cancelToken: 'tok-agenda-overlap',
      })
      .returning()
    const insertedId = inserted?.id
    if (!insertedId) throw new Error('appointment insert returned no row')

    const from = new Date('2026-03-10T00:00:00Z')
    const to = new Date('2026-03-10T23:59:59Z')

    const rows = await listAppointmentsBetween(tenantId, from, to)

    expect(rows.map((r) => r.id)).toContain(insertedId)
  })
})
