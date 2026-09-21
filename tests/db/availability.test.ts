import { and, eq } from 'drizzle-orm'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { createTestDb } from './harness'

const { db } = await createTestDb()
vi.mock('@/db/client', () => ({ db }))

// authedAction reads the session through src/lib/auth.ts's getSession — see
// tests/db/service.test.ts for why this is mocked rather than driven
// through a real request.
const getSessionMock = vi.fn()
vi.mock('@/lib/auth', () => ({ getSession: getSessionMock }))

// revalidatePath needs a live Next.js request/render store that does not
// exist when actions are called directly here (see tests/db/service.test.ts).
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const { saveWeeklyHours, saveException, deleteException } = await import(
  '@/actions/availability'
)
const { availabilityExceptions, tenants, weeklyHours } = await import(
  '@/db/schema'
)
const { getException, getWeeklyHours } = await import(
  '@/db/queries/availability'
)
const { generateSlots } = await import('@/domain/slots')
const { addDays, localDateOf, weekdayOf } = await import('@/domain/time')

const TIMEZONE = 'America/Sao_Paulo'

function signInAs(tenantId: string) {
  getSessionMock.mockResolvedValue({
    user: { id: `user-${tenantId}`, tenantId },
  })
}

beforeEach(() => {
  getSessionMock.mockReset()
})

let tenantCounter = 0
async function makeTenant(slug?: string) {
  tenantCounter += 1
  const [tenant] = await db
    .insert(tenants)
    .values({
      slug: slug ?? `tenant-${tenantCounter}`,
      name: `Tenant ${tenantCounter}`,
      timezone: TIMEZONE,
    })
    .returning()
  if (!tenant) throw new Error('tenant insert returned no row')
  return tenant
}

async function rowsFor(tenantId: string, weekday: number) {
  return db.query.weeklyHours.findMany({
    where: and(
      eq(weeklyHours.tenantId, tenantId),
      eq(weeklyHours.weekday, weekday),
    ),
  })
}

describe('saveWeeklyHours', () => {
  test('saving two intervals for one weekday stores exactly two rows for it', async () => {
    const tenant = await makeTenant()
    signInAs(tenant.id)

    const result = await saveWeeklyHours({
      weekday: 1,
      ranges: [
        { startMinute: 540, endMinute: 720 },
        { startMinute: 780, endMinute: 1080 },
      ],
    })
    expect(result?.data).toEqual({ ok: true })

    const rows = await rowsFor(tenant.id, 1)
    expect(rows).toHaveLength(2)
  })

  test('re-saving that weekday with one interval leaves exactly one row — the replace is complete, not additive', async () => {
    const tenant = await makeTenant()
    signInAs(tenant.id)

    await saveWeeklyHours({
      weekday: 1,
      ranges: [
        { startMinute: 540, endMinute: 720 },
        { startMinute: 780, endMinute: 1080 },
      ],
    })

    const second = await saveWeeklyHours({
      weekday: 1,
      ranges: [{ startMinute: 600, endMinute: 900 }],
    })
    expect(second?.data).toEqual({ ok: true })

    const rows = await rowsFor(tenant.id, 1)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ startMinute: 600, endMinute: 900 })
  })

  test('overlapping intervals are rejected with RANGE_OVERLAP and nothing is written — the previous rows survive intact', async () => {
    const tenant = await makeTenant()
    signInAs(tenant.id)

    await saveWeeklyHours({
      weekday: 1,
      ranges: [{ startMinute: 540, endMinute: 720 }],
    })
    const before = await rowsFor(tenant.id, 1)

    const result = await saveWeeklyHours({
      weekday: 1,
      ranges: [
        { startMinute: 540, endMinute: 780 },
        { startMinute: 700, endMinute: 1080 },
      ],
    })
    expect(result?.data).toEqual({ ok: false, error: 'RANGE_OVERLAP' })

    const after = await rowsFor(tenant.id, 1)
    expect(after).toEqual(before)
  })

  test('an end before the start is rejected with RANGE_INVALID', async () => {
    const tenant = await makeTenant()
    signInAs(tenant.id)

    const result = await saveWeeklyHours({
      weekday: 2,
      ranges: [{ startMinute: 720, endMinute: 540 }],
    })
    expect(result?.data).toEqual({ ok: false, error: 'RANGE_INVALID' })

    const rows = await rowsFor(tenant.id, 2)
    expect(rows).toHaveLength(0)
  })

  test("an action carrying another tenant's weekday changes nothing", async () => {
    const owner = await makeTenant('dono-dos-horarios')
    const attacker = await makeTenant('outro-tenant-horarios')

    signInAs(owner.id)
    await saveWeeklyHours({
      weekday: 3,
      ranges: [{ startMinute: 540, endMinute: 720 }],
    })
    const ownerBefore = await rowsFor(owner.id, 3)
    expect(ownerBefore).toHaveLength(1)

    // The attacker has no session tie to the owner's tenant — calling the
    // same weekday only ever touches rows scoped to ctx.tenantId, which is
    // the attacker's own id, never the owner's.
    signInAs(attacker.id)
    await saveWeeklyHours({
      weekday: 3,
      ranges: [{ startMinute: 0, endMinute: 60 }],
    })

    const ownerAfter = await rowsFor(owner.id, 3)
    expect(ownerAfter).toEqual(ownerBefore)
  })
})

describe('saveException', () => {
  test('saving an exception twice for the same date updates it rather than creating a second row', async () => {
    const tenant = await makeTenant()
    signInAs(tenant.id)

    const date = '2026-12-25'
    const first = await saveException({ date, isClosed: true })
    expect(first?.data).toEqual({ ok: true })

    const second = await saveException({
      date,
      isClosed: false,
      startMinute: 540,
      endMinute: 720,
    })
    expect(second?.data).toEqual({ ok: true })

    const rows = await db.query.availabilityExceptions.findMany({
      where: and(
        eq(availabilityExceptions.tenantId, tenant.id),
        eq(availabilityExceptions.date, date),
      ),
    })
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      isClosed: false,
      startMinute: 540,
      endMinute: 720,
    })
  })

  test('an exception with an end before the start is rejected with RANGE_INVALID', async () => {
    const tenant = await makeTenant()
    signInAs(tenant.id)

    const result = await saveException({
      date: '2026-11-01',
      isClosed: false,
      startMinute: 720,
      endMinute: 540,
    })
    expect(result?.data).toEqual({ ok: false, error: 'RANGE_INVALID' })
  })

  test("an action carrying another tenant's exception date changes nothing", async () => {
    const owner = await makeTenant('dono-da-excecao')
    const attacker = await makeTenant('outro-tenant-excecao')
    const date = '2026-12-25'

    signInAs(owner.id)
    await saveException({ date, isClosed: true })
    const ownerBefore = await db.query.availabilityExceptions.findFirst({
      where: and(
        eq(availabilityExceptions.tenantId, owner.id),
        eq(availabilityExceptions.date, date),
      ),
    })
    expect(ownerBefore).toBeDefined()

    // Same date, different tenant: the unique target is (tenant_id, date),
    // so this is a distinct row, not a conflict with the owner's.
    signInAs(attacker.id)
    await saveException({
      date,
      isClosed: false,
      startMinute: 0,
      endMinute: 60,
    })

    const ownerAfter = await db.query.availabilityExceptions.findFirst({
      where: and(
        eq(availabilityExceptions.tenantId, owner.id),
        eq(availabilityExceptions.date, date),
      ),
    })
    expect(ownerAfter).toEqual(ownerBefore)

    const attackerRow = await db.query.availabilityExceptions.findFirst({
      where: and(
        eq(availabilityExceptions.tenantId, attacker.id),
        eq(availabilityExceptions.date, date),
      ),
    })
    expect(attackerRow).toMatchObject({ isClosed: false })
  })

  test("deleteException removes only the caller tenant's row for that date", async () => {
    const owner = await makeTenant('dono-remove-excecao')
    const attacker = await makeTenant('outro-tenant-remove-excecao')
    const date = '2027-01-01'

    signInAs(owner.id)
    await saveException({ date, isClosed: true })

    signInAs(attacker.id)
    await saveException({ date, isClosed: true })

    // Attacker deletes "their" row for that date — only their own row (by
    // tenant scoping) is ever a candidate, so the owner's is untouched.
    await deleteException({ date })

    const ownerRow = await db.query.availabilityExceptions.findFirst({
      where: and(
        eq(availabilityExceptions.tenantId, owner.id),
        eq(availabilityExceptions.date, date),
      ),
    })
    expect(ownerRow).toBeDefined()

    const attackerRow = await db.query.availabilityExceptions.findFirst({
      where: and(
        eq(availabilityExceptions.tenantId, attacker.id),
        eq(availabilityExceptions.date, date),
      ),
    })
    expect(attackerRow).toBeUndefined()
  })
})

describe('the link that actually matters: saved weekly hours feed generateSlots', () => {
  test('Monday 540-720 and 780-1080 produce no slots between 12:00 and 13:00', async () => {
    const tenant = await makeTenant('link-para-slots')
    signInAs(tenant.id)

    await saveWeeklyHours({
      weekday: 1, // Monday
      ranges: [
        { startMinute: 540, endMinute: 720 }, // 09:00-12:00
        { startMinute: 780, endMinute: 1080 }, // 13:00-18:00
      ],
    })

    // Walk forward from today to the next Monday so this test never goes
    // stale and never needs a hard-coded future date.
    const now = new Date()
    let date = localDateOf(now, TIMEZONE)
    while (weekdayOf(date, TIMEZONE) !== 1) {
      date = addDays(date, 1)
    }

    const weeklyHoursForDay = await getWeeklyHours(tenant.id, 1)
    const exception = await getException(tenant.id, date)
    expect(exception).toBeNull()

    const slots = generateSlots({
      date,
      timezone: TIMEZONE,
      weeklyHours: weeklyHoursForDay,
      exception,
      service: { durationMinutes: 30, bufferMinutes: 0 },
      busy: [],
      now,
      minNoticeMinutes: 0,
      maxAdvanceDays: 14,
    })

    expect(slots.length).toBeGreaterThan(0)

    const localMinutesOf = (instant: Date) => {
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

    const lunchSlots = slots.filter((slot) => {
      const startMinute = localMinutesOf(slot.startsAt)
      return startMinute >= 720 && startMinute < 780
    })
    expect(lunchSlots).toHaveLength(0)
  })
})
