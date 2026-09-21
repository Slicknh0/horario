import { createHash, timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { seedDemo } from '@/../scripts/seed'
import { env } from '@/lib/env'

// That header is the entire security boundary on a route that wipes and
// reseeds a tenant, so it's compared as fixed-length digests rather than
// with `!==`: hashing both sides first means a missing or short header
// never short-circuits the comparison on length before timingSafeEqual
// runs (timingSafeEqual itself throws on unequal-length buffers, and a
// plain string comparison bails out character-by-character — either way
// leaks, via response timing, how much of a guess was already correct).
// SHA-256 always produces 32 bytes, so the two digests are always
// comparable regardless of what the caller sent.
function timingSafeCompare(a: string, b: string): boolean {
  const digestA = createHash('sha256').update(a).digest()
  const digestB = createHash('sha256').update(b).digest()
  return timingSafeEqual(digestA, digestB)
}

// Anyone can sign in with the published demo credentials and delete
// everything in the demo tenant, so this endpoint is what makes the demo
// self-restoring — Vercel's cron (see vercel.json) calls it nightly. The
// bearer check runs before any work happens: an unauthenticated request
// must never trigger a wipe-and-reseed, or this route is a public
// denial-of-service button.
export async function GET(request: Request) {
  const authorization = request.headers.get('authorization') ?? ''
  const expected = `Bearer ${env.CRON_SECRET}`
  if (!timingSafeCompare(authorization, expected)) {
    // Same generic response for a missing header and a wrong secret —
    // neither case should be distinguishable from the other.
    return new NextResponse('Unauthorized', { status: 401 })
  }

  await seedDemo()
  return NextResponse.json({ ok: true })
}
