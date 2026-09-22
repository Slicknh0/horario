import { createRequire } from 'node:module'
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import { drizzle as drizzlePostgresJs } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { env } from '@/lib/env'
import * as schema from './schema'

// Production default, unchanged: postgres-js against a real Postgres
// server. The only other path is opt-in, selected by DATABASE_DRIVER=pglite
// (never set in production — see src/lib/env.ts and the startup guard
// below), and exists solely so the Playwright e2e suite (tests/e2e/**) can
// run the whole app — real browser, real Next server, real HTTP — against
// a database that needs no Docker or Postgres server process on this
// machine: a single file-backed PGlite instance (`new PGlite(dataDir,
// ...)`). drizzle's pglite driver is already exercised by ten suites
// under tests/db.
//
// Deliberately no `await` on the constructor and no top-level await on
// `db` itself (confirmed against PGlite's own source: `.query()` calls
// `_checkReady()` and waits internally) — this module is loaded by more
// than Next's bundler: `tsx scripts/seed.ts` (`pnpm seed`) transpiles it
// to CommonJS, and esbuild's CJS output format rejects top-level await
// outright ("Top-level await is currently not supported with the "cjs"
// output format"). Keeping construction fully synchronous keeps `db`
// usable everywhere exactly as it always was, under every tool this file
// runs under.
function createDb(): PostgresJsDatabase<typeof schema> {
  if (env.DATABASE_DRIVER === 'pglite') {
    // A real production deployment must never run against a local WASM
    // file while believing it's talking to the real database: writes
    // would land, reads would work, and the actual server would simply
    // never see any of it — no error, no alarm, silent divergence. This
    // is the one thing that makes NODE_ENV=production + DATABASE_DRIVER=
    // pglite safe: the e2e suite runs the app via `next start` (see
    // playwright.config.ts) — production mode — by design, which is
    // otherwise indistinguishable from a misconfigured real deployment.
    // tests/e2e/env.ts is the only place that sets this flag; DATABASE_
    // DRIVER=pglite alone (e.g. a stray env var copy-pasted into a real
    // deployment) still trips this and throws. See the comment on
    // E2E_ALLOW_PGLITE_IN_PRODUCTION_MODE in src/lib/env.ts.
    if (
      process.env.NODE_ENV === 'production' &&
      !env.E2E_ALLOW_PGLITE_IN_PRODUCTION_MODE
    ) {
      throw new Error(
        'DATABASE_DRIVER=pglite with NODE_ENV=production: PGlite is for the ' +
          'Playwright e2e suite only (see tests/e2e/env.ts) and must never ' +
          'back a real deployment — set DATABASE_DRIVER=postgres (or leave ' +
          'it unset) instead.',
      )
    }
    // require(), not a static top-level `import`: @electric-sql/pglite is
    // a devDependency (only ever needed for tests/e2e, never in a real
    // deploy) that ships a real WASM binary. A static import at module
    // scope loads it unconditionally into every server bundle regardless
    // of DATABASE_DRIVER — including a production deploy that ran a
    // --prod-only install and never has the package on disk at all, which
    // would crash the whole app at module-load time even though this
    // branch is never taken. Loading it here means it is only ever
    // touched when this branch actually runs, which (with the guard
    // above) can only happen in the e2e suite. `require()` rather than
    // `await import()` specifically because createDb() must stay fully
    // synchronous — see the "no top-level await" comment above;
    // createRequire(import.meta.url) resolves correctly whether this
    // module ends up compiled to ESM (Next's server runtime) or CJS (tsx
    // transpiling scripts/seed.ts), unlike a bare `require` global, which
    // only exists under CJS.
    const require = createRequire(import.meta.url)
    const { PGlite } =
      require('@electric-sql/pglite') as typeof import('@electric-sql/pglite')
    const { btree_gist } =
      require('@electric-sql/pglite/contrib/btree_gist') as typeof import('@electric-sql/pglite/contrib/btree_gist')
    const dataDir = env.PGLITE_DATA_DIR ?? '.data/e2e-pglite'
    const client = new PGlite(dataDir, { extensions: { btree_gist } })
    // PgliteDatabase and PostgresJsDatabase are both a PgDatabase over the
    // same Postgres dialect and the same `schema` — same select/insert/
    // update/delete/query/transaction surface, only their driver-specific
    // result-type generic differs. This branch only ever runs in dev/e2e
    // (the guard above throws otherwise), so every call site seeing the
    // one type the rest of the app already expects is worth the cast.
    return drizzlePglite(client, {
      schema,
    }) as unknown as PostgresJsDatabase<typeof schema>
  }
  const client = postgres(env.DATABASE_URL, { max: 10 })
  return drizzlePostgresJs(client, { schema })
}

// `next start` (and `next dev`) does NOT give this module a single shared
// module registry across the whole server: the App Router compiles each
// route (every page, every Route Handler, e.g. `/api/auth/[...all]` vs.
// the `/app` layout's Server Component tree) into its own bundle, and a
// module with no cross-bundle identity gets re-evaluated — and its
// top-level `const db = createDb()` re-run — once per bundle that imports
// it. For postgres-js that only means redundant connection pools against
// the one real server everyone still shares. For the pglite branch it is
// silent data loss: `new PGlite(dataDir, ...)` loads the file-backed
// directory into its own private in-memory WASM instance at construction
// time, so two separately-constructed instances pointed at the same
// directory do NOT see each other's writes (this is exactly what PGlite's
// own docs mean by "not safe for concurrent access" — it is not limited to
// separate OS processes, e.g. `next build`'s parallel workers, which is
// the hazard tests/e2e/prepare-and-start.ts already routes around).
// Concretely: a browser signs in (write goes to the route-handler bundle's
// PGlite instance) and is immediately redirected by the `/app` layout,
// whose Server Component bundle calls getSession() against its OWN,
// separately-constructed PGlite instance — opened once at server startup
// against the same directory, but with no way to see a write another
// instance made afterward — so the session it just received a cookie for
// looks like it was never created. Caching the instance on `globalThis`
// (the standard Next.js fix for this exact class of bug — see Next's own
// guidance for Prisma/database clients under HMR) guarantees every bundle
// that imports this module resolves to the one instance actually backing
// the connection, no matter how many separate module evaluations import
// it — unconditionally, for both drivers: postgres-js only ever loses
// redundant connection pools to this, never correctness, but there is no
// reason to pay that cost in production either, and gating the cache to
// one driver silently reintroduces the multi-instance hazard for whichever
// driver isn't covered.
const globalForDb = globalThis as unknown as {
  __horarioDb?: PostgresJsDatabase<typeof schema>
}

if (!globalForDb.__horarioDb) globalForDb.__horarioDb = createDb()
export const db = globalForDb.__horarioDb

// The type of the callback's `tx` parameter, derived from `db.transaction`
// itself rather than hand-assembled from drizzle-orm's generics — so a
// query helper can accept "db or a transaction" and stay correct if the
// driver or schema ever changes.
export type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0]
