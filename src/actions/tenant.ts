'use server'

import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '@/db/client'
import { getTenantBySlug } from '@/db/queries/tenant'
import { tenants, user } from '@/db/schema'
import { normalizeSlug, validateSlug } from '@/domain/slug'
import { auth } from '@/lib/auth'
import { publicAction } from '@/lib/safe-action'

const schema = z.object({
  name: z.string().min(2).max(80),
  slug: z.string().min(3).max(50),
  email: z.string().email(),
  password: z.string().min(8),
})

// Postgres unique_violation. Drizzle wraps driver errors in
// DrizzleQueryError; the SQLSTATE code lives on `.cause`, not on the
// top-level error (see tests/db/constraint.test.ts for the same pattern).
const UNIQUE_VIOLATION = '23505'

function isUniqueViolation(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  const cause = error.cause
  return (
    typeof cause === 'object' &&
    cause !== null &&
    'code' in cause &&
    cause.code === UNIQUE_VIOLATION
  )
}

// Compensation steps must never throw out of the action: a failed cleanup
// would otherwise mask the original failure (or crash the action outright),
// which is exactly the orphaned-row problem this exists to prevent.
async function deleteUserSafely(userId: string, context: { slug: string }) {
  try {
    await db.delete(user).where(eq(user.id, userId))
  } catch (cleanupCause) {
    console.error('signUpBusiness: failed to compensate user', {
      ...context,
      userId,
      cleanupCause,
    })
  }
}

async function deleteTenantSafely(tenantId: string, context: { slug: string }) {
  try {
    await db.delete(tenants).where(eq(tenants.id, tenantId))
  } catch (cleanupCause) {
    console.error('signUpBusiness: failed to compensate tenant', {
      ...context,
      tenantId,
      cleanupCause,
    })
  }
}

export const signUpBusiness = publicAction
  .inputSchema(schema)
  .action(async ({ parsedInput }) => {
    const slug = normalizeSlug(parsedInput.slug)
    const valid = validateSlug(slug)
    if (!valid.ok) return { ok: false as const, error: valid.error }

    const taken = await getTenantBySlug(slug)
    if (taken) return { ok: false as const, error: 'SLUG_TAKEN' as const }

    // Better Auth's adapter manages its own connection, so none of this can
    // share a single Drizzle transaction. Track what actually gets created
    // so a failure at any step can be compensated for precisely, instead of
    // leaving an orphaned tenant or a tenant-less user permanently occupying
    // the slug/e-mail with no way for the owner to ever finish signing up.
    let createdTenantId: string | null = null
    let createdUserId: string | null = null

    try {
      const [tenant] = await db
        .insert(tenants)
        .values({ slug, name: parsedInput.name })
        .returning()
      if (!tenant) throw new Error('tenant insert returned no row')
      createdTenantId = tenant.id

      const signUpResult = await auth.api.signUpEmail({
        body: {
          email: parsedInput.email,
          password: parsedInput.password,
          name: parsedInput.name,
        },
      })
      createdUserId = signUpResult.user.id

      await db
        .update(user)
        .set({ tenantId: tenant.id })
        .where(eq(user.email, parsedInput.email))

      return { ok: true as const, slug }
    } catch (cause) {
      // The availability check above and this insert are not atomic, so a
      // concurrent signup can still win the race between them. The unique
      // index on tenant.slug is the real guard; surface its violation as
      // the same field error the availability check would have given,
      // rather than the generic SIGNUP_FAILED below. Guarded by
      // `createdTenantId === null` so a unique violation from anything
      // that runs after the tenant insert succeeds (e.g. the user's own
      // unique e-mail constraint) isn't misreported as a slug conflict.
      if (createdTenantId === null && isUniqueViolation(cause)) {
        return { ok: false as const, error: 'SLUG_TAKEN' as const }
      }

      console.error('signUpBusiness: failed, compensating', { slug, cause })

      // Undo whatever was actually created, most-dependent first: the
      // Better Auth user (its session/account rows cascade from it) before
      // the tenant it referenced, so a retry with the same slug and e-mail
      // can succeed afterwards.
      if (createdUserId) await deleteUserSafely(createdUserId, { slug })
      if (createdTenantId) await deleteTenantSafely(createdTenantId, { slug })

      return { ok: false as const, error: 'SIGNUP_FAILED' as const }
    }
  })
