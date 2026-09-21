import { createSafeActionClient } from 'next-safe-action'
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
  return next({ ctx: { tenantId } })
})
