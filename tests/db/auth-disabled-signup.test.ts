import { eq } from 'drizzle-orm'
import { describe, expect, test, vi } from 'vitest'
import { createTestDb } from './harness'

const { db } = await createTestDb()
vi.mock('@/db/client', () => ({ db }))

const { auth } = await import('@/lib/auth')
const { user } = await import('@/db/schema')

// Finding 10: POST /api/auth/sign-up/email was publicly reachable and could
// permanently squat an e-mail (user_email_unique then makes the real
// owner's signUpBusiness fail forever). Fixed via `disabledPaths` in
// src/lib/auth.ts — this proves BOTH halves of that fix at once: the public
// HTTP route is gone, and the direct auth.api.signUpEmail call
// signUpBusiness (and scripts/seed.ts) depend on still works exactly as
// before. If either half regressed, exactly one of these two tests would
// catch it.
describe('the public sign-up/email route', () => {
  test('POST /api/auth/sign-up/email is disabled (404), not reachable by a stranger', async () => {
    const response = await auth.handler(
      new Request('http://localhost:3000/api/auth/sign-up/email', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email: 'stranger@example.com',
          password: 'senha12345',
          name: 'Stranger',
        }),
      }),
    )
    expect(response.status).toBe(404)

    const created = await db.query.user.findFirst({
      where: eq(user.email, 'stranger@example.com'),
    })
    expect(created).toBeUndefined()
  })

  test('auth.api.signUpEmail keeps working when called directly (signUpBusiness, scripts/seed.ts)', async () => {
    const result = await auth.api.signUpEmail({
      body: {
        email: 'programmatic@example.com',
        password: 'senha12345',
        name: 'Programmatic',
      },
    })
    expect(result.user.email).toBe('programmatic@example.com')

    const created = await db.query.user.findFirst({
      where: eq(user.email, 'programmatic@example.com'),
    })
    expect(created).toBeDefined()
  })
})
