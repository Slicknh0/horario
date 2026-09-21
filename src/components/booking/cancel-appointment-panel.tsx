'use client'

import { useRouter } from 'next/navigation'
import { useAction } from 'next-safe-action/hooks'
import { useState } from 'react'
import { cancelAppointment } from '@/actions/cancel-appointment'
import { Button } from '@/components/ui/button'
import { messageFor } from '@/lib/errors'

// A two-step inline confirm (button -> "tem certeza?" -> button), the same
// pattern src/components/service-list.tsx already uses for its edit
// toggle, rather than a modal dialog — this codebase has no dialog
// primitive installed (one was hand-rolled and deliberately removed, see
// commit 4a78ea3), and a destructive action taken from a link with no
// account behind it doesn't need one: the confirmation lives on the same
// page, not layered over it.
export function CancelAppointmentPanel({ token }: { token: string }) {
  const router = useRouter()
  const [confirming, setConfirming] = useState(false)

  const { execute, result, isExecuting } = useAction(cancelAppointment, {
    onSuccess: ({ data }) => {
      // Re-runs the server component so it re-reads the appointment and
      // renders the "foi cancelado" branch itself — this panel never
      // tracks the cancelled state locally, so there is exactly one source
      // of truth for what the page shows.
      if (data.ok) router.refresh()
    },
  })

  // Same shape as every other action-backed component in this codebase
  // (see booking-flow.tsx, service-list.tsx): a thrown/unrecognized
  // failure surfaces as serverError with no `data` at all, and must still
  // show something rather than leave the button silently re-enabled.
  const actionError = result.serverError
    ? ('UNEXPECTED_ERROR' as const)
    : result.data && !result.data.ok
      ? result.data.error
      : undefined

  if (!confirming) {
    return (
      <Button
        type="button"
        variant="destructive"
        onClick={() => setConfirming(true)}
      >
        Cancelar agendamento
      </Button>
    )
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
      <p className="text-sm text-fg">
        Tem certeza que deseja cancelar este agendamento? Essa ação não pode ser
        desfeita.
      </p>

      {actionError ? (
        <p role="alert" className="text-sm text-danger">
          {messageFor(actionError)}
        </p>
      ) : null}

      <div className="flex gap-2">
        <Button
          type="button"
          variant="destructive"
          disabled={isExecuting}
          onClick={() => execute({ token })}
        >
          {isExecuting ? 'Cancelando…' : 'Sim, cancelar'}
        </Button>
        <Button
          type="button"
          variant="ghost"
          disabled={isExecuting}
          onClick={() => setConfirming(false)}
        >
          Voltar
        </Button>
      </div>
    </div>
  )
}
