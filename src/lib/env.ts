import { createEnv } from '@t3-oss/env-nextjs'
import { z } from 'zod'

export const env = createEnv({
  server: {
    DATABASE_URL: z.string().url(),
    // Opt-in switch, off (postgres-js against a real server) unless set —
    // see src/db/client.ts. The only thing that ever sets it is the
    // Playwright e2e suite (tests/e2e/env.ts): this machine has no Docker
    // and no Postgres server, so the e2e app runs against a file-backed
    // PGlite instance instead. Never set in production.
    DATABASE_DRIVER: z.enum(['postgres', 'pglite']).default('postgres'),
    // Only read when DATABASE_DRIVER === 'pglite'; the directory a
    // file-backed PGlite instance persists to (src/db/client.ts falls back
    // to a default if this is unset).
    PGLITE_DATA_DIR: z.string().optional(),
    BETTER_AUTH_SECRET: z.string().min(32),
    BETTER_AUTH_URL: z.string().url(),
    RESEND_API_KEY: z.string().min(1),
    EMAIL_FROM: z.string().email(),
    // Env-gated no-op for sendConfirmationEmail (src/lib/email.ts) — set by
    // the e2e suite so no test run ever makes a real call to Resend.
    // Never set in production.
    DISABLE_EMAIL_SEND: z
      .enum(['true', 'false'])
      .default('false')
      .transform((v) => v === 'true'),
    // Turns off better-auth's default production rate limiting (see
    // src/lib/auth.ts) — set only by the e2e suite, whose fast automated
    // browser can legitimately burst past a real production budget.
    // Never set in production.
    DISABLE_AUTH_RATE_LIMIT: z
      .enum(['true', 'false'])
      .default('false')
      .transform((v) => v === 'true'),
    DEMO_EMAIL: z.string().email(),
    DEMO_PASSWORD: z.string().min(8),
    CRON_SECRET: z.string().min(16),
  },
  client: {
    NEXT_PUBLIC_APP_URL: z.string().url(),
  },
  experimental__runtimeEnv: {
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  },
})
