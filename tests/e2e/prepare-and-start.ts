// The e2e webServer's actual entrypoint (see playwright.config.ts's
// `webServer.command`), not a Playwright lifecycle hook: Playwright starts
// `webServer` and runs `globalSetup` concurrently, not one after the
// other (see https://github.com/microsoft/playwright/issues/7597), so a
// separate `globalSetup` step that migrates/seeds/builds cannot be
// trusted to finish before `webServer`'s own command needs the result.
// Chaining every step inside this one script — the thing `webServer`
// actually runs — is what guarantees the order.
//
// Runs once, against the single file-backed PGlite instance the whole
// e2e run shares (env.ts points this process and the app's own
// DATABASE_DRIVER=pglite branch at the same directory): wipe, migrate,
// seed, build, then exec the long-lived `next start` that actually serves
// the specs' requests.
import { execFileSync, spawn } from 'node:child_process'
import { mkdir, rm } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
// Side effect: loads .env (or relies on CI's job env) and sets
// DATABASE_DRIVER=pglite / PGLITE_DATA_DIR / DISABLE_EMAIL_SEND on this
// process's own env — this script is spawned by Playwright as a fresh
// process, so it re-runs that load itself rather than trusting whatever
// the parent playwright.config.ts process already did.
import { E2E_PGLITE_DIR } from './env'

// Every child process below is spawned with `shell: true` and every
// argument that follows is a hardcoded string literal ('pnpm', 'seed',
// 'start', etc.) — never interpolated from user input, an env var, or
// anything else outside this file. `shell: true` is required on Windows:
// `pnpm` resolves to a `.cmd`/`.ps1` shim there, and Node's
// child_process refuses to exec a shim directly without a shell (see
// Node's own ENOENT-on-Windows-without-shell documentation). Do not "fix"
// this by dropping `shell: true` — that breaks Windows — and do not
// start passing dynamic/interpolated values as args without re-adding
// escaping; the `shell: true` security warning Node prints
// (DEP0190/CVE-class shell-injection risk) applies to unescaped
// *variable* input, not to these fixed literals.
async function main(): Promise<void> {
  // A fresh database every run: booking.spec.ts and agenda.spec.ts each
  // create their own appointments, and re-running against yesterday's
  // leftovers would let stale data mask a real regression.
  await rm(E2E_PGLITE_DIR, { recursive: true, force: true })
  // PGlite's Node filesystem backend doesn't create parent directories on
  // its own — .data/ needs to exist before the constructor below can
  // create the leaf directory under it.
  await mkdir(E2E_PGLITE_DIR, { recursive: true })

  // Migrate through a dedicated PGlite client — the exact same pattern
  // tests/db/harness.ts already uses for every PGlite-backed suite — not
  // the app's own db singleton (src/db/client.ts), so this step has
  // nothing to do with that module's driver-cast.
  const migrationClient = await new PGlite(E2E_PGLITE_DIR, {
    extensions: { btree_gist },
  })
  await migrate(drizzle(migrationClient), { migrationsFolder: './drizzle' })
  await migrationClient.close()

  // Seed via a plain `pnpm seed` child process — the exact same idempotent
  // seedDemo() `pnpm seed` and the nightly cron both run, in a completely
  // separate Node process, rather than importing scripts/seed.ts in this
  // one. Importing it directly here (or importing src/db/client.ts, which
  // it needs) hit Node's require(esm) cycle guard under Playwright's own
  // module loader ("Cannot require() ES Module ... in a cycle") — both
  // modules use top-level await / import.meta.url, which makes them true
  // ES modules. A subprocess sidesteps that entirely, and doubles as one
  // more proof this is the same seed a real deploy runs, not a parallel
  // implementation of it. DATABASE_DRIVER=pglite / PGLITE_DATA_DIR (set by
  // the env.ts import above) carry through via `env`, so the child seeds
  // the same directory this step just migrated.
  execFileSync('pnpm', ['seed'], {
    cwd: process.cwd(),
    env: process.env,
    stdio: 'inherit',
    shell: true,
  })

  // Build with DATABASE_DRIVER forced back to postgres-js (its lazy,
  // no-real-connection-at-construction default) — `next build` collects
  // page data across many parallel worker processes ("Generating static
  // pages using N workers"), and each one imports src/db/client.ts for
  // module metadata even for routes it never renders. With
  // DATABASE_DRIVER=pglite that meant several processes independently
  // constructing a PGlite client against the *same* file-backed directory
  // at once — PGlite is not safe for that, and it surfaced as build-time
  // "PGlite failed to initialize properly" / "RuntimeError: Aborted()",
  // and, worse, left the database in a state where the freshly-started
  // server's session lookups silently failed. postgres-js has no such
  // hazard (`postgres()` never connects at construction), which is
  // exactly why the app never hit this before this branch existed.
  execFileSync('pnpm', ['build'], {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_DRIVER: 'postgres' },
    stdio: 'inherit',
    shell: true,
  })

  // Finally, the single long-lived server process that actually serves
  // the specs' requests — DATABASE_DRIVER=pglite (this process's own env,
  // untouched since the build step above only overrode it for that one
  // child), opening the directory this script just migrated and seeded.
  // Spawned (not exec'd — Node has no direct process-replacing exec on
  // Windows) and kept in the foreground: Playwright's own webServer
  // process-management sends this script a termination signal when the
  // run ends, and that has to reach `next start` too, or the port stays
  // held after the suite finishes.
  const server = spawn('pnpm', ['start'], {
    cwd: process.cwd(),
    env: process.env,
    stdio: 'inherit',
    shell: true,
  })
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(signal, () => server.kill(signal))
  }
  const exitCode = await new Promise<number>((resolve) => {
    server.on('exit', (code) => resolve(code ?? 0))
  })
  process.exit(exitCode)
}

main().catch((error: unknown) => {
  console.error('[e2e prepare-and-start] failed:', error)
  process.exit(1)
})
