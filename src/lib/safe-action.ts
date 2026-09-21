import { eq } from 'drizzle-orm'
import { createSafeActionClient } from 'next-safe-action'
import { db } from '@/db/client'
import { appointments } from '@/db/schema'
import { getSession } from './auth'

export const publicAction = createSafeActionClient()

// The hard rule every later task depends on: no authenticated action ever
// accepts `tenantId` from its input. This middleware is the only place
// `ctx.tenantId` is set, and it always comes from the server-verified
// session, never from client-supplied data.
export const authedAction = publicAction.use(async ({ next }) => {
  const session = await getSession()
  const tenantId = session?.user.tenantId
  if (!tenantId) {
    throw new Error('UNAUTHENTICATED')
  }
  return next({ ctx: { tenantId, userId: session.user.id } })
})

// Authorizes by a bearer token embedded in the client input (e.g. a
// cancellation link), not by session — the customer holding the link never
// signs in. The looked-up appointment is handed down as ctx so the action
// never re-queries it, and a missing/invalid token fails closed as
// NOT_FOUND rather than distinguishing "no token" from "unknown token".
export const tokenAction = publicAction.use(async ({ next, clientInput }) => {
  const token = (clientInput as { token?: string } | undefined)?.token
  if (!token) throw new Error('NOT_FOUND')
  const appointment = await db.query.appointments.findFirst({
    where: eq(appointments.cancelToken, token),
  })
  if (!appointment) throw new Error('NOT_FOUND')
  return next({ ctx: { appointment } })
})
