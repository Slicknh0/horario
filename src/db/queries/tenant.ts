import { eq } from 'drizzle-orm'
import { db } from '@/db/client'
import { tenants } from '@/db/schema'

export async function getTenantBySlug(slug: string) {
  return db.query.tenants.findFirst({ where: eq(tenants.slug, slug) })
}

export async function getTenantById(id: string) {
  return db.query.tenants.findFirst({ where: eq(tenants.id, id) })
}
