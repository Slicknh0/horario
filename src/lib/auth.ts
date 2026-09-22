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
