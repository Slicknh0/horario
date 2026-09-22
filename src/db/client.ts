import { PGlite } from '@electric-sql/pglite'
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist'
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import { drizzle as drizzlePostgresJs } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { env } from '@/lib/env'
import * as schema from './schema'

// Production default, unchanged: postgres-js against a real Postgres
// server. The only other path is opt-in, selected by DATABASE_DRIVER=pglite
// (never set in production — see src/lib/env.ts), and exists solely so the
// Playwright e2e suite (tests/e2e/**) can run the whole app — real
// browser, real Next server, real HTTP — against a database that needs no
// Docker or Postgres server process on this machine: a single file-backed
// PGlite instance (`new PGlite(dataDir, ...)`). drizzle's pglite driver is
// already exercised by ten suites under tests/db.
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
    const dataDir = env.PGLITE_DATA_DIR ?? '.data/e2e-pglite'
    const client = new PGlite(dataDir, { extensions: { btree_gist } })
    // PgliteDatabase and PostgresJsDatabase are both a PgDatabase over the
    // same Postgres dialect and the same `schema` — same select/insert/
    // update/delete/query/transaction surface, only their driver-specific
    // result-type generic differs. This branch only ever runs in dev/e2e
    // (the flag above is never set in production), so every call site
    // seeing the one type the rest of the app already expects is worth
    // the cast.
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
// that imports this module resolves to the one PGlite instance actually
// backing the directory, no matter how many separate module evaluations
// import it.
const globalForDb = globalThis as unknown as {
  __horarioDb?: PostgresJsDatabase<typeof schema>
}

export const db = globalForDb.__horarioDb ?? createDb()
if (env.DATABASE_DRIVER === 'pglite') globalForDb.__horarioDb = db

// The type of the callback's `tx` parameter, derived from `db.transaction`
// itself rather than hand-assembled from drizzle-orm's generics — so a
// query helper can accept "db or a transaction" and stay correct if the
// driver or schema ever changes.
export type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0]
