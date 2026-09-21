import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { createTestDb } from './harness'

const { db } = await createTestDb()
vi.mock('@/db/client', () => ({ db }))

// authedAction reads the session through src/lib/auth.ts's getSession, and
// getSession() itself needs a real request's headers() — which does not
// exist in this test process. Mocking the module lets each test act as
// whichever tenant it needs, the same way the real middleware would derive
// ctx.tenantId from a verified session, never from action input.
const getSessionMock = vi.fn()
vi.mock('@/lib/auth', () => ({ getSession: getSessionMock }))

// revalidatePath requires a live Next.js request/render store (see
// node_modules/next/dist/server/web/spec-extension/revalidate.js); calling
// the actions directly here, outside any request, would otherwise throw
// "Invariant: static generation store missing".
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const { createService, updateService, setServiceActive } = await import(
  '@/actions/service'
)
const { tenants, services } = await import('@/db/schema')

function signInAs(tenantId: string) {
  getSessionMock.mockResolvedValue({
    user: { id: `user-${tenantId}`, tenantId },
  })
}

beforeEach(() => {
  getSessionMock.mockReset()
})

async function makeTenant(plan: 'free' | 'pro', slug: string) {
  const [tenant] = await db
    .insert(tenants)
    .values({ slug, name: `Tenant ${slug}`, plan })
    .returning()
  if (!tenant) throw new Error('tenant insert returned no row')
  return tenant
}

const baseService = {
  name: 'Corte de cabelo',
  durationMinutes: 30,
  bufferMinutes: 5,
  priceCents: 3500,
}

describe('service actions: the free plan limit', () => {
  test('creating three services on a free tenant succeeds', async () => {
    const tenant = await makeTenant('free', 'tres-servicos')
    signInAs(tenant.id)

    for (let i = 0; i < 3; i++) {
      const result = await createService({
        ...baseService,
        name: `Serviço ${i}`,
      })
      expect(result?.data).toEqual({ ok: true })
    }

    const rows = await db.query.services.findMany({
      where: eq(services.tenantId, tenant.id),
    })
    expect(rows).toHaveLength(3)
    expect(rows.every((row) => row.isActive)).toBe(true)
  })

  test('creating a fourth returns PLAN_LIMIT and writes no row', async () => {
    const tenant = await makeTenant('free', 'quarto-servico')
    signInAs(tenant.id)

    for (let i = 0; i < 3; i++) {
      await createService({ ...baseService, name: `Serviço ${i}` })
    }

    const fourth = await createService({
      ...baseService,
      name: 'Serviço extra',
    })
    expect(fourth?.data).toEqual({ ok: false, error: 'PLAN_LIMIT' })

    const rows = await db.query.services.findMany({
      where: eq(services.tenantId, tenant.id),
    })
    expect(rows).toHaveLength(3)
    expect(rows.some((row) => row.name === 'Serviço extra')).toBe(false)
  })

  test('deactivating one then creating another succeeds — the slot is genuinely freed', async () => {
    const tenant = await makeTenant('free', 'libera-vaga')
    signInAs(tenant.id)

    const created = [] as { id: string }[]
    for (let i = 0; i < 3; i++) {
      const result = await createService({
        ...baseService,
        name: `Serviço ${i}`,
      })
      expect(result?.data).toEqual({ ok: true })
    }
    const rows = await db.query.services.findMany({
      where: eq(services.tenantId, tenant.id),
    })
    for (const row of rows) created.push({ id: row.id })

    const blocked = await createService({
      ...baseService,
      name: 'Bloqueado',
    })
    expect(blocked?.data).toEqual({ ok: false, error: 'PLAN_LIMIT' })

    const firstId = created[0]?.id
    if (!firstId) throw new Error('expected a created service id')
    const deactivated = await setServiceActive({ id: firstId, isActive: false })
    expect(deactivated?.data).toEqual({ ok: true })

    const freed = await createService({
      ...baseService,
      name: 'Novo depois de liberar',
    })
    expect(freed?.data).toEqual({ ok: true })

    const activeRows = await db.query.services.findMany({
      where: eq(services.tenantId, tenant.id),
    })
    const activeCount = activeRows.filter((row) => row.isActive).length
    expect(activeCount).toBe(3)
  })

  test('setServiceActive(true) on a free tenant already at 3 active returns PLAN_LIMIT', async () => {
    const tenant = await makeTenant('free', 'reativar-no-limite')
    signInAs(tenant.id)

    const ids: string[] = []
    for (let i = 0; i < 3; i++) {
      await createService({ ...baseService, name: `Serviço ${i}` })
    }
    const active = await db.query.services.findMany({
      where: eq(services.tenantId, tenant.id),
    })
    for (const row of active) ids.push(row.id)

    // Add a fourth, inactive service directly (bypassing the action, since
    // creating it active would itself be blocked) to have something to
    // reactivate while already sitting at the limit.
    const [inactive] = await db
      .insert(services)
      .values({
        ...baseService,
        name: 'Inativo',
        tenantId: tenant.id,
        isActive: false,
      })
      .returning()
    if (!inactive) throw new Error('service insert returned no row')

    const result = await setServiceActive({ id: inactive.id, isActive: true })
    expect(result?.data).toEqual({ ok: false, error: 'PLAN_LIMIT' })

    const row = await db.query.services.findFirst({
      where: eq(services.id, inactive.id),
    })
    expect(row?.isActive).toBe(false)
  })

  test('a pro tenant is not limited', async () => {
    const tenant = await makeTenant('pro', 'plano-pro')
    signInAs(tenant.id)

    for (let i = 0; i < 5; i++) {
      const result = await createService({
        ...baseService,
        name: `Serviço pro ${i}`,
      })
      expect(result?.data).toEqual({ ok: true })
    }

    const rows = await db.query.services.findMany({
      where: eq(services.tenantId, tenant.id),
    })
    expect(rows).toHaveLength(5)
    expect(rows.every((row) => row.isActive)).toBe(true)
  })
})

describe('service actions: tenant isolation', () => {
  // The most important test in the file: an id alone is not authorization.
  // Every action scopes its WHERE by ctx.tenantId (from the session) as
  // well as the row id from input, so a service id that belongs to another
  // tenant must match zero rows — never the other tenant's row.
  test('an action called with a service id belonging to another tenant changes nothing', async () => {
    const owner = await makeTenant('free', 'dono-do-servico')
    const attacker = await makeTenant('free', 'outro-tenant')

    signInAs(owner.id)
    const created = await createService(baseService)
    expect(created?.data).toEqual({ ok: true })
    const ownerRows = await db.query.services.findMany({
      where: eq(services.tenantId, owner.id),
    })
    const target = ownerRows[0]
    if (!target) throw new Error('expected a created service')

    signInAs(attacker.id)

    const activeToggle = await setServiceActive({
      id: target.id,
      isActive: false,
    })
    expect(activeToggle?.data).toEqual({ ok: true })

    const updateAttempt = await updateService({
      id: target.id,
      name: 'Nome roubado',
      durationMinutes: 45,
      bufferMinutes: 0,
      priceCents: 1,
    })
    expect(updateAttempt?.data).toEqual({ ok: true })

    const untouched = await db.query.services.findFirst({
      where: eq(services.id, target.id),
    })
    expect(untouched).toEqual(target)
  })
})

describe('updateService', () => {
  // drizzle's .set() silently drops keys whose value is exactly undefined,
  // so a naive "send undefined when the field is empty" implementation
  // would leave a service's old description in place forever once set —
  // this proves the actual column gets cleared to null, not left stale.
  test('clearing an existing description actually nulls it, not leaves it stale', async () => {
    const tenant = await makeTenant('free', 'limpa-descricao')
    signInAs(tenant.id)

    await createService({ ...baseService, description: 'Detalhes aqui' })
    const [created] = await db.query.services.findMany({
      where: eq(services.tenantId, tenant.id),
    })
    if (!created) throw new Error('expected a created service')
    expect(created.description).toBe('Detalhes aqui')

    const result = await updateService({
      id: created.id,
      name: created.name,
      description: null,
      durationMinutes: created.durationMinutes,
      bufferMinutes: created.bufferMinutes,
      priceCents: created.priceCents,
    })
    expect(result?.data).toEqual({ ok: true })

    const row = await db.query.services.findFirst({
      where: eq(services.id, created.id),
    })
    expect(row?.description).toBeNull()
  })
})
