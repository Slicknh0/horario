import { and, asc, eq } from 'drizzle-orm'
import { db } from '@/db/client'
import { availabilityExceptions, weeklyHours } from '@/db/schema'
import type { DayException, LocalDate, TimeRange } from '@/domain/types'

// Returns the open windows for that weekday, shaped exactly as
// generateSlots' SlotInput.weeklyHours expects (a tenant may have more than
// one window per weekday, e.g. a lunch break split).
export function getWeeklyHours(tenantId: string, weekday: number) {
  return db
    .select({
      startMinute: weeklyHours.startMinute,
      endMinute: weeklyHours.endMinute,
    })
    .from(weeklyHours)
    .where(
      and(eq(weeklyHours.tenantId, tenantId), eq(weeklyHours.weekday, weekday)),
    )
}

// Returns the single exception row for that local date, or null when none
// exists — the caller passes it straight through to generateSlots, whose
// `exception` parameter is `DayException | null`. Drizzle's findFirst
// resolves to `undefined` on no match, never `null`, so that's normalized
// here rather than left for every caller to repeat.
export async function getException(
  tenantId: string,
  date: LocalDate,
): Promise<DayException | null> {
  const row = await db.query.availabilityExceptions.findFirst({
    where: and(
      eq(availabilityExceptions.tenantId, tenantId),
      eq(availabilityExceptions.date, date),
    ),
  })
  return row ?? null
}

export type WeeklyHoursByWeekday = Record<number, TimeRange[]>

// Every weekday (0..6) is present as a key even when empty, so the
// /app/horarios page can render all seven rows without a caller-side
// default-fill step.
export async function listWeeklyHours(
  tenantId: string,
): Promise<WeeklyHoursByWeekday> {
  const rows = await db
    .select({
      weekday: weeklyHours.weekday,
      startMinute: weeklyHours.startMinute,
      endMinute: weeklyHours.endMinute,
    })
    .from(weeklyHours)
    .where(eq(weeklyHours.tenantId, tenantId))
    .orderBy(asc(weeklyHours.weekday), asc(weeklyHours.startMinute))

  const byWeekday: WeeklyHoursByWeekday = {
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

export type AvailabilityException = typeof availabilityExceptions.$inferSelect

// All exceptions a tenant has configured, past and future, oldest first —
// the /app/horarios page owns filtering/labeling by date, this just returns
// the tenant's own rows.
export function listExceptions(
  tenantId: string,
): Promise<AvailabilityException[]> {
  return db
    .select()
    .from(availabilityExceptions)
    .where(eq(availabilityExceptions.tenantId, tenantId))
    .orderBy(asc(availabilityExceptions.date))
}
