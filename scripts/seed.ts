// Seeds (and reseeds) the public demo tenant: a barbershop with a full week
// of plausible history and a stretch of upcoming bookings, so a recruiter
// or prospective client who clicks "Ver demonstração" lands in a populated
// agenda instead of an empty grid. seedDemo() is imported both by `pnpm
// seed` (the CLI runner at the bottom of this file) and by the nightly
// cron route (src/app/api/cron/reset-demo/route.ts), which is what keeps
// the public demo clean even though anyone can log into it and delete
// everything.
import { randomBytes } from 'node:crypto'
import { pathToFileURL } from 'node:url'
import { eq } from 'drizzle-orm'
import { db } from '@/db/client'
import {
  appointments,
  availabilityExceptions,
  services,
  tenants,
  user,
  weeklyHours,
} from '@/db/schema'
import { generateSlots } from '@/domain/slots'
import { addDays, localDateOf, weekdayOf } from '@/domain/time'
import type {
  DayException,
  Interval,
  LocalDate,
  TimeRange,
} from '@/domain/types'
import { auth } from '@/lib/auth'
import { DEMO_TENANT_SLUG } from '@/lib/demo'
import { env } from '@/lib/env'

const DEMO_TIMEZONE = 'America/Sao_Paulo'
// Left at the tenants table's own defaults (120 minutes notice, 60 days
// advance) — the demo should behave exactly like a tenant that never
// touched those settings, not a specially tuned one.
const DEMO_MIN_NOTICE_MINUTES = 120
const DEMO_MAX_ADVANCE_DAYS = 60

const MIN = {
  open9: 9 * 60,
  close12: 12 * 60,
  open13: 13 * 60,
  close15: 15 * 60,
  close19: 19 * 60,
} as const

type DemoServiceInput = {
  name: string
  durationMinutes: number
  bufferMinutes: number
  priceCents: number
  isActive: boolean
  sortOrder: number
}

// Four services, one inactive — three active services on a `free` plan
// (PLAN_LIMITS.free.maxActiveServices === 3, see src/domain/plan.ts) means
// the paywall card reads 3/3 exactly, which is the point of Pezinho being
// seeded but switched off rather than left out entirely.
const DEMO_SERVICES: DemoServiceInput[] = [
  {
    name: 'Corte',
    durationMinutes: 45,
    bufferMinutes: 10,
    priceCents: 5000,
    isActive: true,
    sortOrder: 0,
  },
  {
    name: 'Barba',
    durationMinutes: 30,
    bufferMinutes: 5,
    priceCents: 3500,
    isActive: true,
    sortOrder: 1,
  },
  {
    name: 'Corte + Barba',
    durationMinutes: 75,
    bufferMinutes: 10,
    priceCents: 7500,
    isActive: true,
    sortOrder: 2,
  },
  {
    name: 'Pezinho',
    durationMinutes: 15,
    bufferMinutes: 0,
    priceCents: 2000,
    isActive: false,
    sortOrder: 3,
  },
]

type WeeklyHoursRow = {
  weekday: number
  startMinute: number
  endMinute: number
}

// Monday-Friday 09:00-12:00 and 13:00-19:00 (lunch break), Saturday
// 09:00-15:00 straight through, Sunday closed (no rows at all).
function demoWeeklyHoursRows(): WeeklyHoursRow[] {
  const rows: WeeklyHoursRow[] = []
  for (const weekday of [1, 2, 3, 4, 5]) {
    rows.push({ weekday, startMinute: MIN.open9, endMinute: MIN.close12 })
    rows.push({ weekday, startMinute: MIN.open13, endMinute: MIN.close19 })
  }
  rows.push({ weekday: 6, startMinute: MIN.open9, endMinute: MIN.close15 })
  return rows
}

function weeklyHoursByWeekday(
  rows: WeeklyHoursRow[],
): Record<number, TimeRange[]> {
  const byWeekday: Record<number, TimeRange[]> = {
    0: [],
    1: [],
    2: [],
    3: [],
    4: [],
    5: [],
    6: [],
  }
  for (const row of rows) {
    const bucket = byWeekday[row.weekday] ?? []
    bucket.push({ startMinute: row.startMinute, endMinute: row.endMinute })
    byWeekday[row.weekday] = bucket
  }
  return byWeekday
}

// Removes any previous demo tenant and its linked user so seeding twice
// leaves exactly one demo tenant instead of throwing on the tenant's slug
// or the user's e-mail unique constraints — the nightly cron depends on
// this being safe to call over and over. user.tenantId has no ON DELETE
// cascade (src/db/schema/auth.ts), so the user has to go first,
// most-dependent row before the tenant it references — the same order
// src/actions/tenant.ts uses to compensate a failed signup.
async function deleteExistingDemoTenant(): Promise<void> {
  const existing = await db.query.tenants.findFirst({
    where: eq(tenants.slug, DEMO_TENANT_SLUG),
  })
  if (existing) {
    await db.delete(user).where(eq(user.tenantId, existing.id))
    await db.delete(tenants).where(eq(tenants.id, existing.id))
  }
  // Defensive: a demo user can exist detached from any tenant (e.g. a
  // previous run that created the Better Auth user but failed before
  // linking it to a tenant) — signUpEmail below would otherwise fail on
  // its own e-mail uniqueness even though no tenant row survived to be
  // found above.
  await db.delete(user).where(eq(user.email, env.DEMO_EMAIL))
}

type DemoService = {
  id: string
  name: string
  durationMinutes: number
  bufferMinutes: number
  priceCents: number
}

type DemoCustomer = { name: string; email: string; phone: string }

// A small, varied cast of fake customers, cycled across the seeded
// appointments so the demo agenda doesn't show the same name on every row.
const DEMO_CUSTOMERS: DemoCustomer[] = [
  {
    name: 'Lucas Almeida',
    email: 'lucas.almeida@example.com',
    phone: '11987654321',
  },
  {
    name: 'Mariana Costa',
    email: 'mariana.costa@example.com',
    phone: '11976543210',
  },
  {
    name: 'Pedro Henrique',
    email: 'pedro.henrique@example.com',
    phone: '11965432109',
  },
  {
    name: 'Juliana Souza',
    email: 'juliana.souza@example.com',
    phone: '11954321098',
  },
  {
    name: 'Rafael Lima',
    email: 'rafael.lima@example.com',
    phone: '11943210987',
  },
  {
    name: 'Camila Ferreira',
    email: 'camila.ferreira@example.com',
    phone: '11932109876',
  },
  {
    name: 'Bruno Oliveira',
    email: 'bruno.oliveira@example.com',
    phone: '11921098765',
  },
  {
    name: 'Fernanda Ribeiro',
    email: 'fernanda.ribeiro@example.com',
    phone: '11910987654',
  },
]

// Neutralizes generateSlots' "earliest" and "horizon" gates so it returns
// every grid-aligned, in-hours slot for a date that is safely in the past
// relative to the real `now` — reusing the exact same window/grid logic
// production code runs, instead of re-deriving it here and risking it
// drifting from what generateSlots actually does.
const PAST_SLOT_NOW = new Date('2000-01-01T00:00:00Z')
const PAST_SLOT_MAX_ADVANCE_DAYS = 20_000

function pastCandidateSlots(params: {
  date: LocalDate
  weeklyHoursForDay: TimeRange[]
  service: { durationMinutes: number; bufferMinutes: number }
  busy: Interval[]
}) {
  return generateSlots({
    date: params.date,
    timezone: DEMO_TIMEZONE,
    weeklyHours: params.weeklyHoursForDay,
    exception: null,
    service: params.service,
    busy: params.busy,
    now: PAST_SLOT_NOW,
    minNoticeMinutes: 0,
    maxAdvanceDays: PAST_SLOT_MAX_ADVANCE_DAYS,
  })
}

type AppointmentRow = typeof appointments.$inferInsert

function buildAppointmentRows(params: {
  tenantId: string
  now: Date
  weeklyHoursMap: Record<number, TimeRange[]>
  exceptionDate: LocalDate
  activeServices: DemoService[]
}): AppointmentRow[] {
  const { tenantId, now, weeklyHoursMap, exceptionDate, activeServices } =
    params
  const rows: AppointmentRow[] = []
  if (activeServices.length === 0) return rows

  const today = localDateOf(now, DEMO_TIMEZONE)

  // Past history: split between completed and no_show, walking backward
  // day by day until enough are collected or the lookback window runs out.
  const TARGET_PAST_COUNT = 20
  const PAST_LOOKBACK_DAYS = 60
  const pastReserved: Interval[] = []
  let pastCount = 0

  for (
    let offset = 1;
    pastCount < TARGET_PAST_COUNT && offset <= PAST_LOOKBACK_DAYS;
    offset++
  ) {
    const date = addDays(today, -offset)
    const weekday = weekdayOf(date, DEMO_TIMEZONE)
    const hoursForDay = weeklyHoursMap[weekday] ?? []
    if (hoursForDay.length === 0) continue // Sunday: closed, no rows at all

    const service = activeServices[pastCount % activeServices.length]
    if (!service) continue

    const slots = pastCandidateSlots({
      date,
      weeklyHoursForDay: hoursForDay,
      service,
      busy: pastReserved,
    })
    const slot = slots[Math.floor(slots.length / 2)]
    if (!slot) continue

    const blockedUntil = new Date(
      slot.endsAt.getTime() + service.bufferMinutes * 60_000,
    )
    pastReserved.push({ start: slot.startsAt, end: blockedUntil })

    const customer = DEMO_CUSTOMERS[pastCount % DEMO_CUSTOMERS.length]
    if (!customer) continue

    rows.push({
      tenantId,
      serviceId: service.id,
      customerName: customer.name,
      customerEmail: customer.email,
      customerPhone: customer.phone,
      startsAt: slot.startsAt,
      endsAt: slot.endsAt,
      blockedUntil,
      // Alternates so history shows both outcomes, never all of one kind.
      status: pastCount % 2 === 0 ? 'completed' : 'no_show',
      serviceName: service.name,
      durationMinutes: service.durationMinutes,
      bufferMinutes: service.bufferMinutes,
      priceCents: service.priceCents,
      cancelToken: randomBytes(24).toString('base64url'),
    })
    pastCount++
  }

  // Upcoming bookings: real availability, exactly what bookAppointment
  // would offer a customer landing on the public page right now — each
  // pick is checked against every previous pick via `futureReserved`, so
  // two seeded appointments can never violate the confirmed-only overlap
  // constraint.
  const TARGET_FUTURE_COUNT = 10
  const futureReserved: Interval[] = []
  let futureCount = 0

  for (
    let offset = 0;
    futureCount < TARGET_FUTURE_COUNT && offset <= DEMO_MAX_ADVANCE_DAYS;
    offset++
  ) {
    const date = addDays(today, offset)
    const weekday = weekdayOf(date, DEMO_TIMEZONE)
    const hoursForDay = weeklyHoursMap[weekday] ?? []
    if (hoursForDay.length === 0) continue

    const exception: DayException | null =
      date === exceptionDate
        ? { isClosed: true, startMinute: null, endMinute: null }
        : null

    const service = activeServices[futureCount % activeServices.length]
    if (!service) continue

    const slots = generateSlots({
      date,
      timezone: DEMO_TIMEZONE,
      weeklyHours: hoursForDay,
      exception,
      service,
      busy: futureReserved,
      now,
      minNoticeMinutes: DEMO_MIN_NOTICE_MINUTES,
      maxAdvanceDays: DEMO_MAX_ADVANCE_DAYS,
    })
    if (slots.length === 0) continue

    // A slot partway through the day's offerings, not always the first —
    // spreads seeded bookings across the day instead of bunching at open.
    const slot = slots[Math.floor(slots.length / 3)]
    if (!slot) continue

    const blockedUntil = new Date(
      slot.endsAt.getTime() + service.bufferMinutes * 60_000,
    )
    futureReserved.push({ start: slot.startsAt, end: blockedUntil })

    const customer = DEMO_CUSTOMERS[(futureCount + 3) % DEMO_CUSTOMERS.length]
    if (!customer) continue

    rows.push({
      tenantId,
      serviceId: service.id,
      customerName: customer.name,
      customerEmail: customer.email,
      customerPhone: customer.phone,
      startsAt: slot.startsAt,
      endsAt: slot.endsAt,
      blockedUntil,
      status: 'confirmed',
      serviceName: service.name,
      durationMinutes: service.durationMinutes,
      bufferMinutes: service.bufferMinutes,
      priceCents: service.priceCents,
      cancelToken: randomBytes(24).toString('base64url'),
    })
    futureCount++
  }

  return rows
}

export async function seedDemo(): Promise<void> {
  const now = new Date()

  await deleteExistingDemoTenant()

  const [tenant] = await db
    .insert(tenants)
    .values({
      slug: DEMO_TENANT_SLUG,
      name: 'Barbearia do Zé',
      timezone: DEMO_TIMEZONE,
      plan: 'free',
    })
    .returning()
  if (!tenant) throw new Error('seedDemo: tenant insert returned no row')

  await auth.api.signUpEmail({
    body: {
      email: env.DEMO_EMAIL,
      password: env.DEMO_PASSWORD,
      name: 'Zé',
    },
  })
  await db
    .update(user)
    .set({ tenantId: tenant.id })
    .where(eq(user.email, env.DEMO_EMAIL))

  const insertedServices = await db
    .insert(services)
    .values(
      DEMO_SERVICES.map((service) => ({ ...service, tenantId: tenant.id })),
    )
    .returning()
  const activeServices: DemoService[] = insertedServices.filter(
    (service) => service.isActive,
  )

  const weeklyHoursRows = demoWeeklyHoursRows()
  await db
    .insert(weeklyHours)
    .values(weeklyHoursRows.map((row) => ({ ...row, tenantId: tenant.id })))

  const today = localDateOf(now, DEMO_TIMEZONE)
  const exceptionDate = addDays(today, 14)
  await db.insert(availabilityExceptions).values({
    tenantId: tenant.id,
    date: exceptionDate,
    isClosed: true,
  })

  const appointmentRows = buildAppointmentRows({
    tenantId: tenant.id,
    now,
    weeklyHoursMap: weeklyHoursByWeekday(weeklyHoursRows),
    exceptionDate,
    activeServices,
  })
  if (appointmentRows.length > 0) {
    await db.insert(appointments).values(appointmentRows)
  }
}

// Runs only when this file is executed directly (`pnpm seed`), never when
// it's imported by the cron route — that route reuses the same long-lived
// `db` connection pool and must never call process.exit() out from under
// the rest of the server.
const isMainModule =
  !!process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href

if (isMainModule) {
  seedDemo()
    .then(() => {
      console.log('Demo tenant seeded.')
      process.exit(0)
    })
    .catch((error: unknown) => {
      console.error('seedDemo failed:', error)
      process.exit(1)
    })
}
