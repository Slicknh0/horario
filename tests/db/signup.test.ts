import { eq } from 'drizzle-orm'
import { describe, expect, test, vi } from 'vitest'
import { createTestDb } from './harness'

const { db } = await createTestDb()
vi.mock('@/db/client', () => ({ db }))

const { signUpBusiness } = await import('@/actions/tenant')
const { tenants } = await import('@/db/schema')

describe('signUpBusiness', () => {
  test('creates the tenant and links the user to it', async () => {
    const result = await signUpBusiness({
      name: 'Barbearia do Zé',
      slug: 'Barbearia do Zé',
      email: 'ze@example.com',
      password: 'senha12345',
    })
    expect(result?.data).toEqual({ ok: true, slug: 'barbearia-do-ze' })
  })

  test('refuses a slug already taken', async () => {
    const result = await signUpBusiness({
      name: 'Outra',
      slug: 'barbearia-do-ze',
      email: 'outra@example.com',
      password: 'senha12345',
    })
    expect(result?.data).toEqual({ ok: false, error: 'SLUG_TAKEN' })
  })

  test('refuses a reserved slug', async () => {
    const result = await signUpBusiness({
      name: 'App',
      slug: 'app',
      email: 'app@example.com',
      password: 'senha12345',
    })
    expect(result?.data).toEqual({ ok: false, error: 'SLUG_RESERVED' })
  })

  test('compensates for a failed signUpEmail by removing the orphaned tenant', async () => {
    // ze@example.com already has an account from the first test, so Better
    // Auth's signUpEmail throws here. The tenant insert that happens before
    // that call must not survive the failure.
    const result = await signUpBusiness({
      name: 'Outro Salão',
      slug: 'outro-salao',
      email: 'ze@example.com',
      password: 'senha12345',
    })
    expect(result?.data).toEqual({ ok: false, error: 'SIGNUP_FAILED' })

    const orphan = await db.query.tenants.findFirst({
      where: eq(tenants.slug, 'outro-salao'),
    })
    expect(orphan).toBeUndefined()
  })
})
