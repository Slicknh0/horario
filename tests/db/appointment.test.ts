import { describe, expect, test, vi } from 'vitest'
import { createTestDb } from './harness'

const { db } = await createTestDb()
vi.mock('@/db/client', () => ({ db }))

const { getBusyRanges } = await import('@/db/queries/appointment')
const { appointments, services, tenants } = await import('@/db/schema')

describe('getBusyRanges', () => {
  test('finds an appointment that started before the window but is still blocking inside it', async () => {
    const [tenant] = await db
      .insert(tenants)
      .values({ slug: 'overlap-teste', name: 'Overlap Teste' })
      .returning()
    const tenantId = tenant?.id
    if (!tenantId) throw new Error('tenant insert returned no row')

    const [service] = await db
      .insert(services)
      .values({
        tenantId,
        name: 'Corte',
        durationMinutes: 30,
        bufferMinutes: 10,
        priceCents: 5000,
      })
      .returning()
    const serviceId = service?.id
    if (!serviceId) throw new Error('service insert returned no row')

    // Starts the day before the query window. With the 10-minute buffer,
    // blocked_until reaches 00:30 the next day — inside the window — even
    // though startsAt itself falls outside it. A `between(startsAt, from,
    // to)` filter would miss this row entirely.
    const startsAt = new Date('2026-03-09T23:50:00Z')
    const endsAt = new Date('2026-03-10T00:20:00Z')
    const blockedUntil = new Date('2026-03-10T00:30:00Z')

    await db.insert(appointments).values({
      tenantId,
      serviceId,
      status: 'confirmed',
      customerName: 'Cliente',
      customerEmail: 'c@ex.com',
      customerPhone: '11999999999',
      startsAt,
      endsAt,
      blockedUntil,
      serviceName: 'Corte',
      durationMinutes: 30,
      bufferMinutes: 10,
      priceCents: 5000,
      cancelToken: 'tok-overlap',
    })

    const from = new Date('2026-03-10T00:00:00Z')
    const to = new Date('2026-03-10T23:59:59Z')

    const busy = await getBusyRanges(tenantId, from, to)

    expect(busy).toContainEqual({ start: startsAt, end: blockedUntil })
  })
})
