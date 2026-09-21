'use client'

import * as Dialog from '@radix-ui/react-dialog'
import { useAction } from 'next-safe-action/hooks'
import { setAppointmentStatus } from '@/actions/appointment-status'
import { CloseIcon, PhoneIcon } from '@/components/icons'
import { Button } from '@/components/ui/button'
import type { AgendaAppointment } from '@/domain/agenda'
import { formatTime } from '@/domain/time'
import { AGENDA_STATUS_LABEL } from '@/lib/agenda-status'
import { messageFor } from '@/lib/errors'
import { cn } from '@/lib/utils'

const currencyFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
})

// Built on Radix Dialog rather than hand-rolled — see src/components/ui/switch.tsx
// for the same rationale in this project: a hand-rolled overlay loses focus
// trap, focus restore, aria-modal, Escape handling and scroll lock, which is
// exactly why the project's earlier hand-rolled dialogs were removed.
// `open` is fully controlled by the parent (whether an appointment is
// selected at all), so this component owns no visibility state of its own.
export function AppointmentSheet({
  appointment,
  timezone,
  onOpenChange,
}: {
  appointment: AgendaAppointment | null
  timezone: string
  onOpenChange: (open: boolean) => void
}) {
  const { execute, result, isExecuting, reset } = useAction(
    setAppointmentStatus,
    {
      // The action revalidates '/app' on success, so the Server Component
      // page re-fetches and this sheet's own parent re-renders with the
      // updated status — this component never tracks status locally, it
      // only closes itself.
      onSuccess: () => onOpenChange(false),
    },
  )

  // result.serverError covers a thrown/unrecognized failure — the same gap
  // fixed the same way in service-list.tsx and cancel-appointment-panel.tsx:
  // without it, a failed status change would leave the sheet open with the
  // buttons re-enabled and no explanation of what went wrong.
  const actionError = result.serverError
    ? ('UNEXPECTED_ERROR' as const)
    : undefined

  function handleOpenChange(next: boolean) {
    if (!next) reset()
    onOpenChange(next)
  }

  if (!appointment) return null

  // Unique to this sheet (weekday + day + month), so not one of the
  // duplicated time-only formatters extracted to domain/time.ts's
  // formatTime.
  const dateFormatter = new Intl.DateTimeFormat('pt-BR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: timezone,
  })

  // Bound outside the closure: TypeScript's control-flow narrowing of
  // `appointment` (from the `if (!appointment) return null` guard above)
  // doesn't cross into a nested function body, so this reads the already
  // non-null id once rather than `appointment.id` inside handleStatus.
  const appointmentId = appointment.id

  function handleStatus(status: 'completed' | 'no_show' | 'cancelled') {
    execute({ id: appointmentId, status })
  }

  return (
    <Dialog.Root open onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="animate-agenda-overlay-in fixed inset-0 z-40 bg-bg/70" />
        <Dialog.Content className="animate-agenda-sheet-in fixed inset-y-0 right-0 z-50 flex w-full max-w-sm flex-col gap-5 overflow-y-auto border-l border-border bg-surface p-5 shadow-xl outline-none">
          <div className="flex items-start justify-between gap-3">
            <div className="flex flex-col gap-1.5">
              <Dialog.Title className="font-display text-lg font-semibold text-fg">
                {appointment.customerName}
              </Dialog.Title>
              <span
                className={cn(
                  'inline-flex w-fit items-center rounded-full border px-2 py-0.5 text-xs font-medium',
                  appointment.status === 'no_show'
                    ? 'border-danger text-danger'
                    : 'border-border text-fg-muted',
                )}
              >
                {AGENDA_STATUS_LABEL[appointment.status]}
              </span>
            </div>
            <Dialog.Close asChild>
              <button
                type="button"
                aria-label="Fechar"
                className={cn(
                  'inline-flex size-8 shrink-0 items-center justify-center rounded-md text-fg-muted transition-colors',
                  'hover:bg-surface-raised hover:text-fg',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface',
                )}
              >
                <CloseIcon className="size-4" />
              </button>
            </Dialog.Close>
          </div>

          <Dialog.Description asChild>
            <div className="flex flex-col gap-1 text-sm">
              <span className="capitalize text-fg-muted">
                {dateFormatter.format(appointment.startsAt)}
              </span>
              <span className="tnum font-medium text-fg">
                {formatTime(appointment.startsAt, timezone)}–
                {formatTime(appointment.endsAt, timezone)}
              </span>
            </div>
          </Dialog.Description>

          <div className="flex flex-col gap-1 rounded-lg border border-border bg-surface-raised p-3">
            <span className="font-medium text-fg">
              {appointment.serviceName}
            </span>
            <span className="tnum text-sm text-fg-muted">
              {appointment.durationMinutes} min
              {appointment.bufferMinutes > 0
                ? ` + ${appointment.bufferMinutes} min de intervalo`
                : ''}{' '}
              · {currencyFormatter.format(appointment.priceCents / 100)}
            </span>
          </div>

          {/* The owner's most common action after seeing a no-show: call
              the customer. A real tel: link, not a styled span, so it
              works the same on a phone as any other phone number. */}
          <a
            href={`tel:${appointment.customerPhone}`}
            className={cn(
              'inline-flex items-center gap-2 rounded-md border border-border bg-surface-raised px-3 py-2 text-sm font-medium text-fg transition-colors',
              'hover:bg-surface-raised/70',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface',
            )}
          >
            <PhoneIcon className="size-4 shrink-0" />
            <span className="tnum">{appointment.customerPhone}</span>
          </a>

          {actionError ? (
            <p role="alert" className="text-sm text-danger">
              {messageFor(actionError)}
            </p>
          ) : null}

          <div className="mt-auto flex flex-col gap-2 border-t border-border pt-4">
            <span className="text-xs font-medium text-fg-muted">
              O que aconteceu?
            </span>
            <Button
              type="button"
              variant="secondary"
              disabled={isExecuting}
              onClick={() => handleStatus('completed')}
            >
              Concluído
            </Button>
            {/* Persistent border-danger/text-danger (not just on hover) for
                the same commercial-signal reason no_show gets its own
                block style; the hover state is deliberately left as the
                outline variant's own neutral hover:bg-surface-raised
                rather than a translucent danger tint, so the only new
                pairing this introduces — text-danger on surface-raised —
                is a plain opaque one already measured in
                tests/design/contrast.test.ts. */}
            <Button
              type="button"
              variant="outline"
              disabled={isExecuting}
              className="border-danger text-danger"
              onClick={() => handleStatus('no_show')}
            >
              Não veio
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={isExecuting}
              onClick={() => handleStatus('cancelled')}
            >
              Cancelar agendamento
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
