import { eq } from 'drizzle-orm'
import { describe, expect, test, vi } from 'vitest'
import { createTestDb } from './harness'

const { db } = await createTestDb()
vi.mock('@/db/client', () => ({ db }))

const { signUpBusiness } = await import('@/actions/tenant')
const { tenants, user } = await import('@/db/schema')

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

  test('compensates for a failed user update by removing both the tenant and the user, and lets a retry succeed', async () => {
    const slug = 'falha-negocio'
    const email = 'falha@example.com'

    // Simulate the update-after-signUpEmail step failing: the tenant is
    // already inserted and the Better Auth user already created by this
    // point, so both must be cleaned up, not just the tenant.
    const updateSpy = vi.spyOn(db, 'update').mockImplementationOnce(() => {
      throw new Error('simulated update failure')
    })

    const failed = await signUpBusiness({
      name: 'Falha Negócio',
      slug,
      email,
      password: 'senha12345',
    })
    expect(failed?.data).toEqual({ ok: false, error: 'SIGNUP_FAILED' })
    updateSpy.mockRestore()

    const orphanTenant = await db.query.tenants.findFirst({
      where: eq(tenants.slug, slug),
    })
    expect(orphanTenant).toBeUndefined()

    const orphanUser = await db.query.user.findFirst({
      where: eq(user.email, email),
    })
    expect(orphanUser).toBeUndefined()

    // The property the user actually cares about: the address is usable
    // again, not just internally consistent.
    const retried = await signUpBusiness({
      name: 'Falha Negócio',
      slug,
      email,
      password: 'senha12345',
    })
    expect(retried?.data).toEqual({ ok: true, slug })
  })
})
