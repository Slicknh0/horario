'use server'

import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '@/db/client'
import { appointments, tenants } from '@/db/schema'
import { canCancel } from '@/domain/cancellation'
import { tokenAction } from '@/lib/safe-action'

// Authorized entirely by tokenAction's middleware (see src/lib/safe-action.ts):
// it already resolved ctx.appointment from the token before this ever runs,
// and a missing/unknown token never reaches this body at all — it fails
// closed as NOT_FOUND with no distinction between "no token" and "token
// that never existed". This action never re-queries by id or re-derives
// authorization from anything client-supplied.
export const cancelAppointment = tokenAction
  .inputSchema(z.object({ token: z.string().min(10) }))
  .action(async ({ ctx }) => {
    const tenant = await db.query.tenants.findFirst({
      where: eq(tenants.id, ctx.appointment.tenantId),
    })
    // Invariant, not a user-facing case: appointments.tenant_id is a
    // non-nullable FK, so a resolved appointment always has a tenant row.
    if (!tenant) throw new Error('TENANT_NOT_FOUND')

    const allowed = canCancel({
      status: ctx.appointment.status,
      startsAt: ctx.appointment.startsAt,
      now: new Date(),
      minNoticeMinutes: tenant.minNoticeMinutes,
    })
    if (!allowed.ok) return { ok: false as const, error: allowed.error }

    // The whole operation. The `appointment_no_overlap` exclusion
    // constraint (see drizzle/0001_overlap_constraint.sql) is partial on
    // status = 'confirmed', so a row moved to 'cancelled' simply stops
    // participating in it — the slot is free the instant this commits,
    // with no separate "release" step to get wrong or forget.
    await db
      .update(appointments)
      .set({ status: 'cancelled', cancelledAt: new Date() })
      .where(eq(appointments.id, ctx.appointment.id))

    return { ok: true as const }
  })
