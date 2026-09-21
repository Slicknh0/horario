import { and, asc, count, eq } from 'drizzle-orm'
import { db } from '@/db/client'
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

export async function countActiveServices(tenantId: string): Promise<number> {
  const [row] = await db
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
