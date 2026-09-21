'use client'

import { useAction } from 'next-safe-action/hooks'
import { type FormEvent, useId, useRef, useState } from 'react'
import { deleteException, saveException } from '@/actions/availability'
import { TrashIcon } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { messageFor, type UiError } from '@/lib/errors'

export type ExceptionRow = {
  date: string
  isClosed: boolean
  startMinute: number | null
  endMinute: number | null
}

function minutesToClock(minute: number): string {
  const h = Math.floor(minute / 60)
  const m = minute % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function clockToMinutes(clock: string): number | undefined {
  const match = /^(\d{2}):(\d{2})$/.exec(clock)
  if (!match) return undefined
  const [, hh, mm] = match
  return Number(hh) * 60 + Number(mm)
}

// `date` is a plain 'YYYY-MM-DD' string with no time component. Parsing it
// at UTC noon (rather than midnight local time) and formatting back in UTC
// is what keeps a date like '2026-12-25' from rendering as the 24th in a
// browser west of UTC.
function formatExceptionDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  const instant = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1, 12))
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(instant)
}

// Saving is always an upsert on (tenant_id, date) — typing in a date that
// already has an exception and saving again replaces it, which is also how
// an owner "edits" one: there is no separate edit control on a row below,
// only add-or-replace through this same form.
function ExceptionForm() {
  const formId = useId()
  const formRef = useRef<HTMLFormElement>(null)
  const [isClosed, setIsClosed] = useState(true)
  const { execute, result, isExecuting } = useAction(saveException, {
    onSuccess: ({ data }) => {
      if (data.ok) {
        formRef.current?.reset()
        setIsClosed(true)
      }
    },
  })

  const error: UiError | undefined = result.serverError
    ? 'UNEXPECTED_ERROR'
    : result.data && !result.data.ok
      ? result.data.error
      : undefined

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    const date = String(formData.get('date') ?? '')
    const startClock = String(formData.get('startTime') ?? '')
    const endClock = String(formData.get('endTime') ?? '')

    execute({
      date,
      isClosed,
      startMinute: isClosed ? undefined : clockToMinutes(startClock),
      endMinute: isClosed ? undefined : clockToMinutes(endClock),
    })
  }

  return (
    <form
      ref={formRef}
      onSubmit={handleSubmit}
      className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4"
    >
      <div className="flex flex-wrap items-end gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${formId}-date`}>Data</Label>
          <Input
            id={`${formId}-date`}
            name="date"
            type="date"
            required
            className="tnum"
          />
        </div>

        <div className="flex items-center gap-2 pb-2">
          <Switch
            checked={isClosed}
            onCheckedChange={setIsClosed}
            aria-label={
              isClosed
                ? 'Fechado o dia todo'
                : 'Aberto em horário especial nesta data'
            }
          />
          <span className="text-sm text-fg">Fechado</span>
        </div>

        {!isClosed ? (
          <>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${formId}-start`}>Abre</Label>
              <Input
                id={`${formId}-start`}
                name="startTime"
                type="time"
                required
                className="tnum w-28"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${formId}-end`}>Fecha</Label>
              <Input
                id={`${formId}-end`}
                name="endTime"
                type="time"
                required
                className="tnum w-28"
              />
            </div>
          </>
        ) : null}

        <Button type="submit" disabled={isExecuting}>
          {isExecuting ? 'Salvando…' : 'Salvar exceção'}
        </Button>
      </div>

      {error ? (
        <p role="alert" className="text-sm text-danger">
          {messageFor(error)}
        </p>
      ) : null}
    </form>
  )
}

function ExceptionRowItem({ exception }: { exception: ExceptionRow }) {
  const { execute, result, isExecuting } = useAction(deleteException)
  // deleteException has only one outcome shape ({ ok: true }) — it never
  // fails with a structured error, only a thrown/unexpected one.
  const error: UiError | undefined = result.serverError
    ? 'UNEXPECTED_ERROR'
    : undefined

  const summary =
    exception.isClosed ||
    exception.startMinute === null ||
    exception.endMinute === null
      ? 'Fechado o dia todo'
      : `Horário especial: ${minutesToClock(exception.startMinute)}–${minutesToClock(exception.endMinute)}`

  return (
    <li className="flex flex-col gap-1 rounded-lg border border-border bg-surface p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-col">
        <span className="font-medium text-fg">
          {formatExceptionDate(exception.date)}
        </span>
        <span className="tnum text-sm text-fg-muted">{summary}</span>
        {error ? (
          <span role="alert" className="text-sm text-danger">
            {messageFor(error)}
          </span>
        ) : null}
      </div>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={isExecuting}
        onClick={() => execute({ date: exception.date })}
      >
        <TrashIcon className="size-4" />
        Remover
      </Button>
    </li>
  )
}

export function ExceptionsEditor({
  exceptions,
}: {
  exceptions: ExceptionRow[]
}) {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-fg-muted">
        Uma exceção substitui o horário normal do dia inteiro — ela nunca se
        soma aos horários semanais. Use-a para fechar num feriado ou definir um
        horário especial só para aquela data.
      </p>

      <ExceptionForm />

      {exceptions.length === 0 ? (
        <p className="text-sm text-fg-muted">Nenhuma exceção cadastrada.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {exceptions.map((exception) => (
            <ExceptionRowItem key={exception.date} exception={exception} />
          ))}
        </ul>
      )}
    </div>
  )
}
