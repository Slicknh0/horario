import { and, eq, gt, gte, lt } from 'drizzle-orm'
import { db } from '@/db/client'
import { appointments } from '@/db/schema'
import type { Interval } from '@/domain/types'

export async function getBusyRanges(
  tenantId: string,
  from: Date,
  to: Date,
): Promise<Interval[]> {
  const rows = await db
    .select({
      startsAt: appointments.startsAt,
      blockedUntil: appointments.blockedUntil,
    })
    .from(appointments)
    .where(
      and(
        eq(appointments.tenantId, tenantId),
        eq(appointments.status, 'confirmed'),
        // True interval-overlap, not "starts inside the window": an
        // appointment that started before `from` but whose blocked_until
        // reaches past it is still busy right now. `between` on startsAt
        // alone would miss it, offering the customer a slot the database
        // then refuses via the overlap constraint.
        lt(appointments.startsAt, to),
        gt(appointments.blockedUntil, from),
      ),
    )

  // blocked_until already includes the buffer — the same value the overlap
  // constraint ranges over, so what the UI hides and what the database
  // refuses come from one source and cannot drift apart.
  return rows.map((r) => ({ start: r.startsAt, end: r.blockedUntil }))
}

export function listAppointmentsBetween(
  tenantId: string,
  from: Date,
  to: Date,
) {
  return db
    .select()
    .from(appointments)
    .where(
      and(
        eq(appointments.tenantId, tenantId),
        // Same true interval-overlap semantics as getBusyRanges: an
        // appointment that began before `from` and runs into the window
        // still belongs on the agenda.
        lt(appointments.startsAt, to),
        gt(appointments.blockedUntil, from),
      ),
    )
}

export function countFutureByPhone(tenantId: string, phone: string, now: Date) {
  return db.$count(
    appointments,
    and(
      eq(appointments.tenantId, tenantId),
      eq(appointments.customerPhone, phone),
      eq(appointments.status, 'confirmed'),
      gte(appointments.startsAt, now),
    ),
  )
}

export function getAppointmentByToken(token: string) {
  return db.query.appointments.findFirst({
    where: eq(appointments.cancelToken, token),
  })
}
