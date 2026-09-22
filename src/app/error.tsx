'use client'

import { useEffect } from 'react'
import { Button } from '@/components/ui/button'

// Catches any unhandled throw from a Server Component, layout, or action
// under the root layout (a database blip in getTenantBySlug, for example) —
// every route segment nests under this by default. Without it, Next falls
// back to its own default error page: English copy, no tokens, on a
// product whose interface is otherwise entirely pt-BR and dark. This is a
// Client Component because error.tsx is the one file in the App Router
// that must be — it renders inside a React error boundary, and reset()
// only exists on the client.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('Unhandled error reached the root boundary:', error)
  }, [error])

  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center gap-3 px-4 py-16 text-center">
      <h1 className="font-display text-xl font-semibold text-fg">
        Algo deu errado
      </h1>
      <p className="max-w-sm text-sm text-fg-muted">
        Não conseguimos carregar esta página agora. Isso costuma ser temporário
        — tente novamente em alguns instantes.
      </p>
      <Button type="button" onClick={reset}>
        Tentar novamente
      </Button>
    </main>
  )
}
