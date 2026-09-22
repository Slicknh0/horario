import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { createTestDb } from './harness'

const { db } = await createTestDb()
vi.mock('@/db/client', () => ({ db }))

// Same pattern as tests/db/service.test.ts: authedAction reads the session
// through src/lib/auth.ts's getSession, which needs a real request's
// headers() that doesn't exist in this test process, so the module is
// mocked and each test signs in as whichever tenant it needs.
const getSessionMock = vi.fn()
vi.mock('@/lib/auth', () => ({ getSession: getSessionMock }))

// revalidatePath requires a live Next.js request/render store; calling the
// action directly here, outside any request, would otherwise throw.
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const { updateTenantSettings } = await import('@/actions/tenant')
const { tenants } = await import('@/db/schema')

function signInAs(tenantId: string) {
  getSessionMock.mockResolvedValue({
    user: { id: `user-${tenantId}`, tenantId },
  })
}

beforeEach(() => {
  getSessionMock.mockReset()
})

async function makeTenant(slug: string) {
  const [tenant] = await db
    .insert(tenants)
    .values({ slug, name: `Tenant ${slug}` })
    .returning()
  if (!tenant) throw new Error('tenant insert returned no row')
  return tenant
}

const validInput = {
  name: 'Barbearia Nova',
  timezone: 'America/Bahia',
  minNoticeMinutes: 90,
  maxAdvanceDays: 45,
}

describe('updateTenantSettings', () => {
  test('saves all four fields and they persist', async () => {
    const tenant = await makeTenant('config-persiste')
    signInAs(tenant.id)

    const result = await updateTenantSettings(validInput)
    expect(result?.data).toEqual({ ok: true })

    const row = await db.query.tenants.findFirst({
      where: eq(tenants.id, tenant.id),
    })
    expect(row?.name).toBe(validInput.name)
    expect(row?.timezone).toBe(validInput.timezone)
    expect(row?.minNoticeMinutes).toBe(validInput.minNoticeMinutes)
    expect(row?.maxAdvanceDays).toBe(validInput.maxAdvanceDays)
  })

  // The most important test in the file, same reasoning as
  // tests/db/service.test.ts's tenant-isolation case: this action carries no
  // id at all, only ctx.tenantId from the verified session — so the only way
  // to prove isolation is to sign in as one tenant and read a DIFFERENT
  // tenant's row back whole afterward.
  test("leaves another tenant's row completely untouched", async () => {
    const owner = await makeTenant('config-dono')
    const other = await makeTenant('config-outro')
    signInAs(owner.id)

    const result = await updateTenantSettings(validInput)
    expect(result?.data).toEqual({ ok: true })

    const otherRow = await db.query.tenants.findFirst({
      where: eq(tenants.id, other.id),
    })
    expect(otherRow).toEqual(other)
  })

  test('an invalid IANA timezone is rejected and writes nothing', async () => {
    const tenant = await makeTenant('config-fuso-invalido')
    signInAs(tenant.id)

    const result = await updateTenantSettings({
      ...validInput,
      timezone: 'Not/AZone',
    })
    expect(result?.validationErrors).toBeDefined()
    expect(result?.data).toBeUndefined()

    const row = await db.query.tenants.findFirst({
      where: eq(tenants.id, tenant.id),
    })
    expect(row).toEqual(tenant)
  })

  test('an out-of-range minNoticeMinutes is rejected and writes nothing', async () => {
    const tenant = await makeTenant('config-min-notice-invalido')
    signInAs(tenant.id)

    const result = await updateTenantSettings({
      ...validInput,
      minNoticeMinutes: -1,
    })
    expect(result?.validationErrors).toBeDefined()
    expect(result?.data).toBeUndefined()

    const row = await db.query.tenants.findFirst({
      where: eq(tenants.id, tenant.id),
    })
    expect(row).toEqual(tenant)
  })
})
