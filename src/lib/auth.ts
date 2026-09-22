import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { headers } from 'next/headers'
import { db } from '@/db/client'
import * as schema from '@/db/schema'
import { env } from './env'

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: 'pg', schema }),
  emailAndPassword: { enabled: true },
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,
  user: {
    additionalFields: {
      tenantId: { type: 'string', required: false, input: false },
    },
  },
  // POST /api/auth/sign-up/email is better-auth's own public endpoint and,
  // left reachable, lets a stranger create a `user` row with `tenant_id =
  // NULL` for any e-mail — harmless by itself (authedAction fails closed,
  // the /app layout redirects) but user_email_unique then makes the real
  // owner's signUpBusiness (src/actions/tenant.ts) fail forever at
  // auth.api.signUpEmail with no hint the address is the problem: the
  // e-mail is permanently squatted.
  //
  // `disabledPaths` only gates the HTTP router's onRequest check
  // (node_modules/better-auth/dist/api/index.mjs) — it does NOT touch
  // `auth.api.signUpEmail`, which src/actions/tenant.ts and scripts/seed.ts
  // both call directly (toAuthEndpoints wraps the same handler without
  // going through the router at all, see node_modules/better-auth/dist/api/
  // to-auth-endpoints.mjs). Verified against the installed better-auth
  // (1.7.5): the emailAndPassword.disableSignUp flag was rejected instead —
  // it's checked INSIDE the signUpEmail handler itself
  // (node_modules/better-auth/dist/api/routes/sign-up.mjs), so it would
  // have blocked signUpBusiness's own call too. disabledPaths is the one
  // mechanism that disables only the public route while leaving the
  // programmatic call intact — see tests/db/auth-disabled-signup.test.ts.
  disabledPaths: ['/sign-up/email'],
  // better-auth enables rate limiting by default whenever NODE_ENV is
  // 'production' (node_modules/better-auth/dist/context/create-context.mjs:
  // `enabled: options.rateLimit?.enabled ?? isProduction`) — a real
  // production safeguard this app must keep (sign-in specifically is
  // capped at 3 requests/10s). The Playwright e2e suite runs the app via
  // `next start`, i.e. in production mode, and a fast automated browser
  // legitimately bursts past that budget across a single test (many
  // asset/RSC requests from one IP in a few seconds) in a way no real
  // user would. DISABLE_AUTH_RATE_LIMIT is unset (this key omitted
  // entirely) everywhere except the e2e suite, so production behavior —
  // and normal `pnpm dev`/`pnpm build && pnpm start` — is unchanged.
  ...(env.DISABLE_AUTH_RATE_LIMIT ? { rateLimit: { enabled: false } } : {}),
})

export async function getSession() {
  return auth.api.getSession({ headers: await headers() })
}
