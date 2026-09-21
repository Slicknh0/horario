import { and, eq } from 'drizzle-orm'
import { db } from '@/db/client'
import { availabilityExceptions, weeklyHours } from '@/db/schema'
import type { DayException, LocalDate } from '@/domain/types'

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
