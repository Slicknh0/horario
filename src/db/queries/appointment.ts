import { and, between, eq, gte } from 'drizzle-orm'
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
        between(appointments.startsAt, from, to),
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
        between(appointments.startsAt, from, to),
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
