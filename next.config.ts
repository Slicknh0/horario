import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // @electric-sql/pglite loads its WASM binary and extension bundles
  // (e.g. btree_gist.tar.gz) from paths relative to its own package
  // directory on disk. Bundled through Next's normal Server Components
  // pipeline, those loads break (Turbopack rewrites them into
  // /_next/static/media URLs, which don't exist for a Node.js server
  // runtime reading real files) — opting it out of bundling in favor of
  // plain Node `require` keeps its own relative-path resolution intact.
  // Only ever imported by src/db/client.ts's DATABASE_DRIVER=pglite
  // branch, which is opt-in and never selected in production (see
  // src/lib/env.ts) — this entry changes how that one package is
  // bundled, not what the default postgres-js path does.
  serverExternalPackages: ['@electric-sql/pglite'],
}

export default nextConfig
