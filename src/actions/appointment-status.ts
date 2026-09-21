'use server'

import { and, eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { db } from '@/db/client'
import { appointments } from '@/db/schema'
import { authedAction } from '@/lib/safe-action'

const AGENDA_PATH = '/app'

// The only mutation on the agenda: an owner marking what actually happened
// to a booking. `cancelled_at` is stamped only when the new status is
// 'cancelled' — 'completed' and 'no_show' never touch it (ruling 3). No
// separate "release the slot" step follows: the `appointment_no_overlap`
// exclusion constraint is partial on status = 'confirmed', so this single
// UPDATE is the whole operation (ruling 4), the same reasoning
// cancelAppointment already relies on for the customer-facing cancel path.
export const setAppointmentStatus = authedAction
  .inputSchema(
    z.object({
      id: z.string().uuid(),
      status: z.enum(['completed', 'no_show', 'cancelled']),
    }),
  )
  .action(async ({ parsedInput, ctx }) => {
    await db
      .update(appointments)
      .set({
        status: parsedInput.status,
        cancelledAt: parsedInput.status === 'cancelled' ? new Date() : null,
      })
      // Scoped by tenantId as well as id, from ctx (server-verified
      // session), never from parsedInput: an id belonging to another
      // tenant matches zero rows here rather than someone else's
      // appointment. This predicate is the entire authorization check.
      .where(
        and(
          eq(appointments.id, parsedInput.id),
          eq(appointments.tenantId, ctx.tenantId),
        ),
      )

    revalidatePath(AGENDA_PATH)
    return { ok: true as const }
  })
