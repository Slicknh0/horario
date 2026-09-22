'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { authClient } from '@/lib/auth-client'
import { messageFor } from '@/lib/errors'

// One click into the owner's half of the product — the agenda, the
// paywall, the availability editors — with zero typing. `email`/`password`
// arrive as plain string props from the landing page's Server Component
// (src/app/page.tsx, which reads DEMO_EMAIL/DEMO_PASSWORD from src/lib/env),
// never imported here directly: this file ships to the browser, and env.ts
// is a server-only module.
export function DemoLoginButton({
  email,
  password,
}: {
  email: string
  password: string
}) {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleClick() {
    setPending(true)
    setError(null)
    try {
      const { error: signInError } = await authClient.signIn.email({
        email,
        password,
      })
      if (signInError) {
        // Should not happen against a seeded, always-valid demo account —
        // handled anyway rather than left to throw, since this is the one
        // login a stranger with no context is expected to trust on a click.
        setError(messageFor('INVALID_CREDENTIALS'))
        return
      }
      router.push('/app')
    } catch {
      setError(messageFor('INVALID_CREDENTIALS'))
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="flex flex-col items-start gap-1.5">
      <Button
        type="button"
        variant="secondary"
        onClick={handleClick}
        disabled={pending}
      >
        {pending ? 'Entrando…' : 'Entrar no painel de demonstração'}
      </Button>
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
    </div>
  )
}
