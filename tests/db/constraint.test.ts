import { PGlite } from '@electric-sql/pglite'
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { appointments, services, tenants } from '@/db/schema'

let client: PGlite
let db: ReturnType<typeof drizzle>
let tenantId: string
let serviceId: string

beforeAll(async () => {
  client = await new PGlite({ extensions: { btree_gist } })
  db = drizzle(client)
  await migrate(db, { migrationsFolder: './drizzle' })

  const [tenant] = await db
    .insert(tenants)
    .values({ slug: 'teste', name: 'Teste' })
    .returning()
  tenantId = tenant!.id
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
  serviceId = service!.id
}, 60_000)

afterAll(async () => {
  await client?.close()
})

// 30-minute appointment, 10-minute buffer: blocked_until is 40 minutes after the start.
const book = (
  startsAt: string,
  token: string,
  status: 'confirmed' | 'cancelled' = 'confirmed',
) => {
  const start = new Date(startsAt)
  return db.insert(appointments).values({
    tenantId,
    serviceId,
    status,
    customerName: 'Cliente',
    customerEmail: 'c@ex.com',
    customerPhone: '11999999999',
    startsAt: start,
    endsAt: new Date(start.getTime() + 30 * 60_000),
    blockedUntil: new Date(start.getTime() + 40 * 60_000),
    serviceName: 'Corte',
    durationMinutes: 30,
    bufferMinutes: 10,
    priceCents: 5000,
    cancelToken: token,
  })
}

describe('appointment_no_overlap', () => {
  test('rejects a confirmed appointment overlapping another', async () => {
    await book('2026-03-10T12:00:00Z', 'tok-1')
    // drizzle-orm wraps driver errors in DrizzleQueryError; the Postgres SQLSTATE
    // code lives on `.cause`, not on the top-level error.
    await expect(book('2026-03-10T12:15:00Z', 'tok-2')).rejects.toMatchObject({
      cause: { code: '23P01' },
    })
  })

  test('rejects an appointment starting inside the buffer of another', async () => {
    await expect(book('2026-03-10T12:35:00Z', 'tok-3')).rejects.toMatchObject({
      cause: { code: '23P01' },
    })
  })

  test('accepts an appointment starting exactly when the buffer ends', async () => {
    await expect(book('2026-03-10T12:40:00Z', 'tok-4')).resolves.toBeDefined()
  })

  test('ignores cancelled appointments when checking overlap', async () => {
    await book('2026-03-11T12:00:00Z', 'tok-5', 'cancelled')
    await expect(book('2026-03-11T12:00:00Z', 'tok-6')).resolves.toBeDefined()
  })

  test('rejects a blocked_until earlier than ends_at', async () => {
    const start = new Date('2026-03-12T12:00:00Z')
    await expect(
      db.insert(appointments).values({
        tenantId,
        serviceId,
        status: 'confirmed',
        customerName: 'Cliente',
        customerEmail: 'c@ex.com',
        customerPhone: '11999999999',
        startsAt: start,
        endsAt: new Date(start.getTime() + 30 * 60_000),
        blockedUntil: start,
        serviceName: 'Corte',
        durationMinutes: 30,
        bufferMinutes: 10,
        priceCents: 5000,
        cancelToken: 'tok-7',
      }),
    ).rejects.toMatchObject({ cause: { code: '23514' } })
  })
})
