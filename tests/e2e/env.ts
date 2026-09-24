// Shared by playwright.config.ts (to build the webServer's env),
// tests/e2e/prepare-and-start.ts (to migrate/seed/build before starting
// the real server) and the specs themselves (Playwright test workers do
// not inherit process.env mutations made while playwright.config.ts
// loaded — see the comment on the spec files' own `import './env'`) —
// every one of them imports this module, so this side effect runs once
// per process and all of them agree on where the database lives.
//
// Loads .env the same way tests/setup.ts does for the unit/integration
// suite (Node's native loader; Vitest/Playwright don't load .env files on
// their own), then forces the switches that make the whole app run
// without Docker, a Postgres server or a real Resend account on this
// machine, and without tripping better-auth's production rate limiter
// under a fast automated browser: a file-backed PGlite instance
// (src/db/client.ts) instead of postgres-js, a stubbed e-mail send
// (src/lib/email.ts), and rate limiting off (src/lib/auth.ts).
import path from 'node:path'

export const E2E_PGLITE_DIR = path.resolve(process.cwd(), '.data/e2e-pglite')

// The one address the suite drives the app through. playwright.config.ts
// reads it too, so the browser's origin and the app's own idea of where it
// lives cannot drift apart.
export const E2E_BASE_URL = 'http://localhost:3000'

try {
  process.loadEnvFile('.env')
} catch {
  // No .env file (CI): the workflow injects the required variables
  // directly as job env — see .github/workflows/ci.yml.
}

// Pinned rather than inherited from .env: better-auth rejects a sign-in
// whose Origin differs from BETTER_AUTH_URL, so a developer whose .env points
// elsewhere (a LAN IP, to open the app on a phone) otherwise sees the login
// spec fail for a reason unrelated to the code. NEXT_PUBLIC_APP_URL is
// inlined at build time into the management link, so it is pinned too.
process.env.BETTER_AUTH_URL = E2E_BASE_URL
process.env.NEXT_PUBLIC_APP_URL = E2E_BASE_URL
process.env.DATABASE_DRIVER = 'pglite'
process.env.PGLITE_DATA_DIR = E2E_PGLITE_DIR
process.env.DISABLE_EMAIL_SEND = 'true'
process.env.DISABLE_AUTH_RATE_LIMIT = 'true'
// This suite runs the app via `next start`, i.e. NODE_ENV=production, by
// design — otherwise indistinguishable from a real deployment that had
// DATABASE_DRIVER=pglite set by mistake. This is the deliberate,
// suite-only acknowledgment src/db/client.ts requires before it will
// allow that combination instead of throwing at startup — see the
// comment on E2E_ALLOW_PGLITE_IN_PRODUCTION_MODE in src/lib/env.ts.
process.env.E2E_ALLOW_PGLITE_IN_PRODUCTION_MODE = 'true'
