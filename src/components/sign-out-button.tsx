'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { LogOutIcon } from '@/components/icons'
import { authClient } from '@/lib/auth-client'
import { cn } from '@/lib/utils'

// The one way to end a session in a multi-tenant authenticated product —
// missing entirely before this. better-auth's own client handles clearing
// the session cookie server-side; this component's only job is to wait for
// that and then leave the panel, the same way a sign-in redirects into it.
export function SignOutButton() {
  const router = useRouter()
  const [pending, setPending] = useState(false)

  async function handleSignOut() {
    setPending(true)
    try {
      await authClient.signOut()
    } finally {
      // Always leave the panel, even if the request itself failed — an
      // owner who clicked "Sair" must never be stuck looking at their own
      // agenda with no way out.
      router.push('/')
    }
  }

  return (
    <button
      type="button"
      onClick={handleSignOut}
      disabled={pending}
      className={cn(
        'flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium text-fg-muted transition-colors',
        'hover:bg-surface-raised hover:text-fg',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface',
        'disabled:pointer-events-none disabled:opacity-50',
      )}
    >
      <LogOutIcon className="size-4 shrink-0" />
      {pending ? 'Saindo…' : 'Sair'}
    </button>
  )
}
