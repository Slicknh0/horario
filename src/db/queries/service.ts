import { and, asc, count, eq } from 'drizzle-orm'
import { db, type Transaction } from '@/db/client'
import { services } from '@/db/schema'

export type Service = typeof services.$inferSelect

export function listActiveServices(tenantId: string) {
  return db
    .select()
    .from(services)
    .where(and(eq(services.tenantId, tenantId), eq(services.isActive, true)))
    .orderBy(asc(services.sortOrder))
}

export function listAllServices(tenantId: string) {
  return db
    .select()
    .from(services)
    .where(eq(services.tenantId, tenantId))
    .orderBy(asc(services.sortOrder))
}

// Accepts an optional transaction so a caller enforcing the plan limit can
// count inside the same transaction that holds the tenant row lock — the
// count has to run on the connection holding that lock to actually be
// serialized against a concurrent caller, not just read from `db` on the
// side.
export async function countActiveServices(
  tenantId: string,
  executor: typeof db | Transaction = db,
): Promise<number> {
  const [row] = await executor
    .select({ value: count() })
    .from(services)
    .where(and(eq(services.tenantId, tenantId), eq(services.isActive, true)))
  return row?.value ?? 0
}

export function getServiceForBooking(tenantId: string, serviceId: string) {
  return db.query.services.findFirst({
    where: and(
      eq(services.id, serviceId),
      eq(services.tenantId, tenantId),
      eq(services.isActive, true),
    ),
  })
}
