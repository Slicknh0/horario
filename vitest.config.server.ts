import path from 'node:path'
import { defineConfig } from 'vitest/config'

// A second, separate config rather than a shared `include` flag: this
// suite (tests/db-server/**) needs a real server Postgres reachable via
// DATABASE_URL (drizzle-orm/postgres-js — the production driver), which
// only exists in CI's server-postgres job (see .github/workflows/ci.yml
// and vitest.config.ts's own exclude of this directory). Running it here
// keeps that requirement out of the default `pnpm test`.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/db-server/**/*.test.ts'],
    setupFiles: ['./tests/setup.ts'],
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
})
