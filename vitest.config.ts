import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // tests/e2e needs the app actually running (see playwright.config.ts);
    // tests/db-server needs a real server Postgres (see
    // vitest.config.server.ts, run only by `pnpm test:db-server` / CI's
    // server-postgres job) — neither belongs in the default PGlite-backed
    // run, which must stay runnable with no external dependency.
    exclude: ['tests/e2e/**', 'tests/db-server/**'],
    setupFiles: ['./tests/setup.ts'],
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
})
