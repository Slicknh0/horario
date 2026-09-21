'use client'

import { Toast, useToast } from './toast'

// The stack lives at a fixed viewport corner (not portalled into a specific
// container) precisely so it can never be clipped by an overflow: hidden
// ancestor. aria-live announces new toasts without moving focus.
export function Toaster() {
  const { toasts, dismiss } = useToast()

  return (
    <div
      aria-live="polite"
      aria-atomic="false"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex flex-col items-end gap-2 p-4 sm:inset-x-auto sm:right-0"
    >
      {toasts.map((t) => (
        <div key={t.id} className="pointer-events-auto">
          <Toast toast={t} onDismiss={dismiss} />
        </div>
      ))}
    </div>
  )
}
