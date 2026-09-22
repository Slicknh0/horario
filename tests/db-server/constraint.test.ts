// Runs the exact same overlap-constraint behavior tests/db/constraint.test.ts
// already proves against PGlite, but here through the app's own db
// singleton (src/db/client.ts) — the production postgres-js driver,
// against a real server Postgres (CI's postgres:17 service container; see
// .github/workflows/ci.yml). `pnpm db:migrate` runs as a separate step
// before this suite, so — unlike the PGlite harness — this file never
// runs its own migration.
//
// This is the whole point of the server-postgres CI job: it proves the
// migration SQL (btree_gist, the generated-column-free EXCLUDE
// constraint) actually applies to a real server build, and it exercises
// the one driver path the PGlite suites never touch. Specifically, it
// closes a gap recorded in this project: book-appointment.ts's
// isOverlapViolation() reads `e.constraint_name ?? e.constraint`, but only
// the PGlite field name (`.constraint`, confirmed by inspecting
// @electric-sql/pglite's wire-protocol error parser) had ever been
// exercised by a real run. postgres-js's own error parser
// (node_modules/postgres/src/connection.js, field code 110 -> the string
// 'constraint_name') is the other half of that fallback — the assertion
// below pins that it is `.constraint_name` that fires on this driver.
//
// No teardown: CI's postgres:17 service container is destroyed with the
// job, so there is nothing this suite needs to clean up after itself.
import { randomUUID } from 'node:crypto'
import { beforeAll, describe, expect, test } from 'vitest'
import { db } from '@/db/client'
import { appointments, services, tenants } from '@/db/schema'

let tenantId: string
let serviceId: string

beforeAll(async () => {
  const [tenant] = await db
    .insert(tenants)
    .values({ slug: `server-teste-${randomUUID()}`, name: 'Teste Servidor' })
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

// 30-minute appointment, 10-minute buffer: blocked_until is 40 minutes after the start.
function book(startsAt: string, token: string) {
  const start = new Date(startsAt)
  return db.insert(appointments).values({
    tenantId,
    serviceId,
    status: 'confirmed',
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

describe('appointment_no_overlap (real server Postgres, postgres-js driver)', () => {
  test('rejects an overlapping confirmed appointment, via the postgres-js field name', async () => {
    await book('2026-04-10T12:00:00Z', 'server-tok-1')
    // isOverlapViolation() (src/actions/book-appointment.ts) reads
    // `e.constraint_name ?? e.constraint` — this pins that postgres-js
    // names the field `constraint_name` (see the file-level comment).
    await expect(
      book('2026-04-10T12:15:00Z', 'server-tok-2'),
    ).rejects.toMatchObject({
      cause: {
        code: '23P01',
        constraint_name: 'appointment_no_overlap',
      },
    })
  })

  test('accepts a non-overlapping appointment', async () => {
    await expect(
      book('2026-04-10T13:00:00Z', 'server-tok-3'),
    ).resolves.toBeDefined()
  })
})
