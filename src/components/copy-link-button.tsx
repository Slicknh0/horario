'use client'

import { useState } from 'react'
import { CheckIcon, CopyIcon } from '@/components/icons'
import { cn } from '@/lib/utils'

const COPIED_RESET_MS = 2000

export function CopyLinkButton({ url }: { url: string }) {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), COPIED_RESET_MS)
    } catch {
      // Clipboard access can fail (insecure context, denied permission,
      // unsupported browser). Doing nothing is better than surfacing a
      // scary error for a convenience action the owner can still do by hand.
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      aria-label={copied ? 'Link copiado' : 'Copiar link público'}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-md border border-border p-1.5 text-fg-muted transition-colors',
        'hover:bg-surface-raised hover:text-fg',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface',
      )}
    >
      {copied ? (
        <CheckIcon className="size-4" />
      ) : (
        <CopyIcon className="size-4" />
      )}
    </button>
  )
}
