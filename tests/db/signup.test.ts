import { describe, expect, test, vi } from 'vitest'
import { createTestDb } from './harness'

const { db } = await createTestDb()
vi.mock('@/db/client', () => ({ db }))

const { signUpBusiness } = await import('@/actions/tenant')

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
})
