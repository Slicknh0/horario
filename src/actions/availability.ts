'use server'

import { and, eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { db } from '@/db/client'
import { availabilityExceptions, weeklyHours } from '@/db/schema'
import { validateRanges } from '@/domain/availability-input'
import { authedAction } from '@/lib/safe-action'

const HORARIOS_PATH = '/app/horarios'

const rangeInput = z.object({
  startMinute: z.number().int(),
  endMinute: z.number().int(),
})

const saveWeeklyHoursInput = z.object({
  weekday: z.number().int().min(0).max(6),
  // A day with a lunch break needs two rows; nothing plausible needs more
  // than a handful — this is a generous ceiling against a malformed client,
  // not a real-world limit.
  ranges: z.array(rangeInput).max(20),
})

// Replaces this weekday's rows for the caller's tenant: delete then insert,
// both inside one transaction. If the insert half failed after a bare
// delete had already committed, the day would show as fully closed — no
// bookable slots, and nothing on screen to say why — until someone noticed
// and re-saved. The transaction is what rules that out: either both halves
// land, or neither does and the previous hours are still there.
export const saveWeeklyHours = authedAction
  .inputSchema(saveWeeklyHoursInput)
  .action(async ({ parsedInput, ctx }) => {
    const validated = validateRanges(parsedInput.ranges)
    if (!validated.ok) return { ok: false as const, error: validated.error }

    await db.transaction(async (tx) => {
      // Scoped by ctx.tenantId (from the verified session) as well as the
      // weekday — never by weekday alone, which would touch every tenant's
      // rows for that day.
      await tx
        .delete(weeklyHours)
        .where(
          and(
            eq(weeklyHours.tenantId, ctx.tenantId),
            eq(weeklyHours.weekday, parsedInput.weekday),
          ),
        )

      if (parsedInput.ranges.length > 0) {
        await tx.insert(weeklyHours).values(
          parsedInput.ranges.map((range) => ({
            tenantId: ctx.tenantId,
            weekday: parsedInput.weekday,
            startMinute: range.startMinute,
            endMinute: range.endMinute,
          })),
        )
      }
    })

    revalidatePath(HORARIOS_PATH)
    return { ok: true as const }
  })

const saveExceptionInput = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  isClosed: z.boolean(),
  startMinute: z.number().int().optional(),
  endMinute: z.number().int().optional(),
})

// Upserts on (tenant_id, date): saving the same date twice updates the one
// row instead of hitting the unique-constraint violation or leaving a
// duplicate. The row always carries the caller's own ctx.tenantId, so the
// unique target (tenant_id, date) can only ever match a row this tenant
// owns — another tenant's exception on the same date is a different row
// entirely and is never touched.
export const saveException = authedAction
  .inputSchema(saveExceptionInput)
  .action(async ({ parsedInput, ctx }) => {
    const { date, isClosed } = parsedInput

    // A closed exception carries no hours — an owner cannot half-close a
    // day. Open hours must be a valid single window; the same rule as a
    // weekly interval, just one row instead of a list.
    let startMinute: number | null = null
    let endMinute: number | null = null
    if (!isClosed) {
      if (
        parsedInput.startMinute === undefined ||
        parsedInput.endMinute === undefined
      ) {
        return { ok: false as const, error: 'RANGE_INVALID' as const }
      }
      const validated = validateRanges([
        {
          startMinute: parsedInput.startMinute,
          endMinute: parsedInput.endMinute,
        },
      ])
      if (!validated.ok) return { ok: false as const, error: validated.error }
      startMinute = parsedInput.startMinute
      endMinute = parsedInput.endMinute
    }

    await db
      .insert(availabilityExceptions)
      .values({
        tenantId: ctx.tenantId,
        date,
        isClosed,
        startMinute,
        endMinute,
      })
      .onConflictDoUpdate({
        target: [availabilityExceptions.tenantId, availabilityExceptions.date],
        set: { isClosed, startMinute, endMinute },
      })

    revalidatePath(HORARIOS_PATH)
    return { ok: true as const }
  })

const deleteExceptionInput = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
})

export const deleteException = authedAction
  .inputSchema(deleteExceptionInput)
  .action(async ({ parsedInput, ctx }) => {
    await db
      .delete(availabilityExceptions)
      .where(
        and(
          eq(availabilityExceptions.tenantId, ctx.tenantId),
          eq(availabilityExceptions.date, parsedInput.date),
        ),
      )

    revalidatePath(HORARIOS_PATH)
    return { ok: true as const }
  })
