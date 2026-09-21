// Server-only modules (src/lib/env.ts) validate process.env at import time.
// Vitest does not load .env files into process.env on its own, so tests that
// import anything reaching env.ts (e.g. src/lib/auth.ts) need it loaded first.
try {
  process.loadEnvFile('.env')
} catch {
  // No .env file (e.g. CI): assume the required variables are injected directly.
}
