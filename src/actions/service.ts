'use server'

import { and, eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { db } from '@/db/client'
import { countActiveServices } from '@/db/queries/service'
import { getTenantById } from '@/db/queries/tenant'
import { services } from '@/db/schema'
import { canActivateService } from '@/domain/plan'
import { authedAction } from '@/lib/safe-action'

const SERVICOS_PATH = '/app/servicos'

const serviceInput = z.object({
  name: z.string().min(2).max(80),
  description: z.string().max(280).nullable().optional(),
  durationMinutes: z.number().int().min(5).max(480),
  bufferMinutes: z.number().int().min(0).max(120),
  priceCents: z.number().int().min(0),
})

// Re-checked on every activation attempt (creating a service, or flipping an
// existing one back on) rather than trusted from an earlier read: the active
// count is a moving target, and a tenant sitting at the limit can free a
// slot by deactivating something else between two requests.
async function assertCanActivate(tenantId: string) {
  const tenant = await getTenantById(tenantId)
  if (!tenant) throw new Error('TENANT_NOT_FOUND')
  const active = await countActiveServices(tenantId)
  return canActivateService(tenant.plan, active)
}

export const createService = authedAction
  .inputSchema(serviceInput)
  .action(async ({ parsedInput, ctx }) => {
    const allowed = await assertCanActivate(ctx.tenantId)
    if (!allowed.ok) return { ok: false as const, error: allowed.error }

    await db.insert(services).values({ ...parsedInput, tenantId: ctx.tenantId })
    revalidatePath(SERVICOS_PATH)
    return { ok: true as const }
  })

// Edits a service's own fields. It never touches isActive, so it never
// changes the active count and needs no plan check — setServiceActive owns
// that transition exclusively.
export const updateService = authedAction
  .inputSchema(serviceInput.extend({ id: z.string().uuid() }))
  .action(async ({ parsedInput, ctx }) => {
    const { id, ...fields } = parsedInput

    // Scoped by tenantId as well as id: a service id belonging to another
    // tenant matches zero rows here rather than someone else's row, because
    // ctx.tenantId comes from the verified session, never from parsedInput.
    await db
      .update(services)
      .set(fields)
      .where(and(eq(services.id, id), eq(services.tenantId, ctx.tenantId)))

    revalidatePath(SERVICOS_PATH)
    return { ok: true as const }
  })

export const setServiceActive = authedAction
  .inputSchema(z.object({ id: z.string().uuid(), isActive: z.boolean() }))
  .action(async ({ parsedInput, ctx }) => {
    if (parsedInput.isActive) {
      const allowed = await assertCanActivate(ctx.tenantId)
      if (!allowed.ok) return { ok: false as const, error: allowed.error }
    }

    await db
      .update(services)
      .set({ isActive: parsedInput.isActive })
      .where(
        and(
          eq(services.id, parsedInput.id),
          eq(services.tenantId, ctx.tenantId),
        ),
      )

    revalidatePath(SERVICOS_PATH)
    return { ok: true as const }
  })
