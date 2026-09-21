import { NextResponse } from 'next/server'
import { seedDemo } from '@/../scripts/seed'
import { env } from '@/lib/env'

// Anyone can sign in with the published demo credentials and delete
// everything in the demo tenant, so this endpoint is what makes the demo
// self-restoring — Vercel's cron (see vercel.json) calls it nightly. The
// bearer check runs before any work happens: an unauthenticated request
// must never trigger a wipe-and-reseed, or this route is a public
// denial-of-service button.
export async function GET(request: Request) {
  const authorization = request.headers.get('authorization')
  if (authorization !== `Bearer ${env.CRON_SECRET}`) {
    return new NextResponse('Unauthorized', { status: 401 })
  }

  await seedDemo()
  return NextResponse.json({ ok: true })
}
