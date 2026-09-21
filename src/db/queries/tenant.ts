import { eq } from 'drizzle-orm'
import { db, type Transaction } from '@/db/client'
import { tenants } from '@/db/schema'

export async function getTenantBySlug(slug: string) {
  return db.query.tenants.findFirst({ where: eq(tenants.slug, slug) })
}

export async function getTenantById(id: string) {
  return db.query.tenants.findFirst({ where: eq(tenants.id, id) })
}

// SELECT ... FOR UPDATE inside a transaction: a second concurrent caller
// locking the same tenant row queues behind the first instead of both
// reading the same pre-write state. Only meaningful inside a transaction
// (the lock is released the moment a bare, non-transactional statement
// finishes), so it takes a Transaction, not `db`, and has no non-locking
// counterpart — a caller that doesn't need the lock should use
// getTenantById instead.
export async function lockTenantForUpdate(tx: Transaction, id: string) {
  const [tenant] = await tx
    .select()
    .from(tenants)
    .where(eq(tenants.id, id))
    .for('update')
  return tenant
}
