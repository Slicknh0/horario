import { defineConfig } from '@playwright/test'
// Side effect: loads .env (or falls back to CI's job env) and forces
// DATABASE_DRIVER=pglite / PGLITE_DATA_DIR / DISABLE_EMAIL_SEND for this
// process and everything it spawns — see tests/e2e/env.ts.
import './tests/e2e/env'

// Every env var this process holds (including the three env.ts just set)
// gets forwarded to the webServer command — see tests/e2e/prepare-and-start.ts,
// which needs DATABASE_DRIVER=pglite/PGLITE_DATA_DIR itself (it re-imports
// tests/e2e/env.ts to be sure of that; see the comment there for why this
// process's own env can't be trusted to arrive at all).
function stringEnv(): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) out[key] = value
  }
  return out
}

export default defineConfig({
  testDir: './tests/e2e',
  // A single file-backed PGlite instance is not safe for concurrent
  // access, and both specs book real appointments against the same
  // seeded tenant — one worker keeps every request strictly sequential,
  // which matters far more here than wall-clock speed.
  workers: 1,
  use: {
    baseURL: 'http://localhost:3000',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: {
    // Not `globalSetup`: Playwright starts `webServer` and runs
    // `globalSetup` concurrently, not sequentially (see
    // https://github.com/microsoft/playwright/issues/7597), so a step
    // that migrates/seeds/builds has to be part of what `webServer`
    // itself runs, in order, or `next start` can race a build that
    // hasn't produced `.next` yet. tests/e2e/prepare-and-start.ts wipes
    // and re-seeds the PGlite data directory, builds (with the default
    // postgres-js driver, to dodge a multi-worker-process PGlite hazard —
    // see the comment there), then execs the long-lived `next start`
    // this webServer entry is nominally "starting".
    command: 'pnpm exec tsx tests/e2e/prepare-and-start.ts',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: stringEnv(),
  },
})
