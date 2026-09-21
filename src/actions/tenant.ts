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

export const signUpBusiness = publicAction
  .inputSchema(schema)
  .action(async ({ parsedInput }) => {
    const slug = normalizeSlug(parsedInput.slug)
    const valid = validateSlug(slug)
    if (!valid.ok) return { ok: false as const, error: valid.error }

    const taken = await getTenantBySlug(slug)
    if (taken) return { ok: false as const, error: 'SLUG_TAKEN' as const }

    const [tenant] = await db
      .insert(tenants)
      .values({ slug, name: parsedInput.name })
      .returning()

    await auth.api.signUpEmail({
      body: {
        email: parsedInput.email,
        password: parsedInput.password,
        name: parsedInput.name,
      },
    })
    await db
      .update(user)
      .set({ tenantId: tenant!.id })
      .where(eq(user.email, parsedInput.email))

    return { ok: true as const, slug }
  })
