import { eq } from 'drizzle-orm'
import { describe, expect, test, vi } from 'vitest'
import { createTestDb } from './harness'

const { db } = await createTestDb()
vi.mock('@/db/client', () => ({ db }))

const { GET } = await import('@/app/api/cron/reset-demo/route')
const { env } = await import('@/lib/env')
const { DEMO_TENANT_SLUG } = await import('@/lib/demo')
const { tenants } = await import('@/db/schema')

function requestWith(authorization?: string): Request {
  return new Request('http://localhost/api/cron/reset-demo', {
    headers: authorization ? { authorization } : undefined,
  })
}

async function demoTenantExists(): Promise<boolean> {
  const rows = await db
    .select()
    .from(tenants)
    .where(eq(tenants.slug, DEMO_TENANT_SLUG))
  return rows.length > 0
}

describe('GET /api/cron/reset-demo', () => {
  test('rejects a call with no Authorization header and writes nothing', async () => {
    const response = await GET(requestWith())
    expect(response.status).toBe(401)
    expect(await demoTenantExists()).toBe(false)
  })

  test('rejects a call with the wrong secret and writes nothing', async () => {
    const response = await GET(requestWith('Bearer not-the-real-secret'))
    expect(response.status).toBe(401)
    expect(await demoTenantExists()).toBe(false)
  })

  // The header check must run before any work happens — this is the test
  // that would fail if seedDemo() ever moved ahead of the auth check,
  // turning a public GET route into a wipe-and-reseed button anyone could
  // press.
  test('the correct secret reseeds the demo tenant', async () => {
    const response = await GET(requestWith(`Bearer ${env.CRON_SECRET}`))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true })
    expect(await demoTenantExists()).toBe(true)
  })
})
