import { and, eq } from 'drizzle-orm'
import { describe, expect, test, vi } from 'vitest'
import { createTestDb } from './harness'

const { db } = await createTestDb()
vi.mock('@/db/client', () => ({ db }))

// seedDemo calls auth.api.signUpEmail for real (the same way
// tests/db/signup.test.ts exercises signUpBusiness) rather than mocking
// '@/lib/auth' — betterAuth's drizzleAdapter binds to whatever `db` module
// resolves at import time, which is this test's PGlite-backed instance
// thanks to the vi.mock above, so the demo user really gets created and
// really gets linked to the tenant.
const { seedDemo } = await import('../../scripts/seed')
const { DEMO_TENANT_SLUG } = await import('@/lib/demo')
const { env } = await import('@/lib/env')
const {
  appointments,
  availabilityExceptions,
  services,
  tenants,
  user,
  weeklyHours,
} = await import('@/db/schema')
const { getException, getWeeklyHours } = await import(
  '@/db/queries/availability'
)
const { generateSlots } = await import('@/domain/slots')
const { localDateOf, weekdayOf } = await import('@/domain/time')

async function findDemoTenant() {
  const rows = await db
    .select()
    .from(tenants)
    .where(eq(tenants.slug, DEMO_TENANT_SLUG))
  return rows
}

describe('seedDemo', () => {
  test('creates one demo tenant with its user, four services (one inactive), weekly hours, and an exception', async () => {
    await seedDemo()

    const demoTenants = await findDemoTenant()
    expect(demoTenants).toHaveLength(1)
    const tenant = demoTenants[0]
    if (!tenant) throw new Error('expected the demo tenant to exist')
    expect(tenant.plan).toBe('free')
    expect(tenant.timezone).toBe('America/Sao_Paulo')

    const demoUser = await db.query.user.findFirst({
      where: eq(user.tenantId, tenant.id),
    })
    expect(demoUser).toBeDefined()
    expect(demoUser?.email).toBe(env.DEMO_EMAIL)

    const svc = await db
      .select()
      .from(services)
      .where(eq(services.tenantId, tenant.id))
    expect(svc).toHaveLength(4)
    // Three active services on a free plan reads 3/3 on the paywall card
    // (PLAN_LIMITS.free.maxActiveServices === 3) — the whole reason the
    // fourth service (Pezinho) is seeded switched off rather than omitted.
    expect(svc.filter((s) => s.isActive)).toHaveLength(3)
    expect(svc.filter((s) => !s.isActive)).toHaveLength(1)

    const hours = await db
      .select()
      .from(weeklyHours)
      .where(eq(weeklyHours.tenantId, tenant.id))
    // Monday-Friday, two windows each (lunch break) + Saturday, one window.
    expect(hours).toHaveLength(5 * 2 + 1)

    const exceptions = await db
      .select()
      .from(availabilityExceptions)
      .where(eq(availabilityExceptions.tenantId, tenant.id))
    expect(exceptions).toHaveLength(1)
    expect(exceptions[0]?.isClosed).toBe(true)
  })

  test('seeding twice leaves exactly one demo tenant and does not throw', async () => {
    await seedDemo()
    await expect(seedDemo()).resolves.toBeUndefined()

    const demoTenants = await findDemoTenant()
    expect(demoTenants).toHaveLength(1)

    // The user and its services/appointments belong to the surviving
    // tenant only — nothing orphaned from the first run remains.
    const tenant = demoTenants[0]
    if (!tenant) throw new Error('expected the demo tenant to exist')
    const users = await db
      .select()
      .from(user)
      .where(eq(user.email, env.DEMO_EMAIL))
    expect(users).toHaveLength(1)
    expect(users[0]?.tenantId).toBe(tenant.id)
  })

  test('every seeded appointment satisfies blocked_until === ends_at + buffer_minutes', async () => {
    await seedDemo()
    const [tenant] = await findDemoTenant()
    if (!tenant) throw new Error('expected the demo tenant to exist')

    const rows = await db
      .select()
      .from(appointments)
      .where(eq(appointments.tenantId, tenant.id))
    expect(rows.length).toBeGreaterThan(0)

    for (const row of rows) {
      const expected = row.endsAt.getTime() + row.bufferMinutes * 60_000
      expect(row.blockedUntil.getTime()).toBe(expected)
    }
  })

  // The test that stops the demo from containing bookings the product
  // itself would refuse: reads the seeded hours and exceptions back
  // through the same query layer bookAppointment uses, and checks each
  // confirmed appointment's start against generateSlots' own output for
  // that day.
  test('every seeded confirmed appointment is a slot generateSlots would actually offer', async () => {
    const now = new Date()
    await seedDemo()
    const [tenant] = await findDemoTenant()
    if (!tenant) throw new Error('expected the demo tenant to exist')

    const confirmed = await db
      .select()
      .from(appointments)
      .where(
        and(
          eq(appointments.tenantId, tenant.id),
          eq(appointments.status, 'confirmed'),
        ),
      )
    expect(confirmed.length).toBeGreaterThan(0)

    for (const appointment of confirmed) {
      const date = localDateOf(appointment.startsAt, tenant.timezone)
      const weekday = weekdayOf(date, tenant.timezone)
      const weeklyHoursForDay = await getWeeklyHours(tenant.id, weekday)
      const exception = await getException(tenant.id, date)

      // Busy with every other confirmed appointment (never this one —
      // generateSlots would otherwise see this appointment's own interval
      // as blocking its own start).
      const busy = confirmed
        .filter((other) => other.id !== appointment.id)
        .map((other) => ({ start: other.startsAt, end: other.blockedUntil }))

      const slots = generateSlots({
        date,
        timezone: tenant.timezone,
        weeklyHours: weeklyHoursForDay,
        exception,
        service: {
          durationMinutes: appointment.durationMinutes,
          bufferMinutes: appointment.bufferMinutes,
        },
        busy,
        now,
        minNoticeMinutes: tenant.minNoticeMinutes,
        maxAdvanceDays: tenant.maxAdvanceDays,
      })

      const offered = slots.some(
        (slot) => slot.startsAt.getTime() === appointment.startsAt.getTime(),
      )
      expect(offered).toBe(true)
    }
  })

  test('past appointments exist in both completed and no_show, future ones are confirmed', async () => {
    const now = new Date()
    await seedDemo()
    const [tenant] = await findDemoTenant()
    if (!tenant) throw new Error('expected the demo tenant to exist')

    const rows = await db
      .select()
      .from(appointments)
      .where(eq(appointments.tenantId, tenant.id))
    expect(rows.length).toBeGreaterThan(0)

    const past = rows.filter((r) => r.startsAt.getTime() < now.getTime())
    const future = rows.filter((r) => r.startsAt.getTime() >= now.getTime())

    expect(past.length).toBeGreaterThan(0)
    expect(future.length).toBeGreaterThan(0)

    expect(past.some((r) => r.status === 'completed')).toBe(true)
    expect(past.some((r) => r.status === 'no_show')).toBe(true)
    expect(past.every((r) => r.status !== 'confirmed')).toBe(true)

    expect(future.every((r) => r.status === 'confirmed')).toBe(true)
  })
})
