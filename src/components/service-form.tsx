'use client'

import { useAction } from 'next-safe-action/hooks'
import { type FormEvent, useId, useRef } from 'react'
import { createService, updateService } from '@/actions/service'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { Service } from '@/db/queries/service'
import { messageFor, type UiError } from '@/lib/errors'

const CENTS_PER_REAL = 100

function centsToReaisValue(cents: number): string {
  return (cents / CENTS_PER_REAL).toFixed(2)
}

function reaisInputToCents(raw: FormDataEntryValue | null): number {
  const value = Number(String(raw ?? '0').replace(',', '.'))
  return Math.round(value * CENTS_PER_REAL)
}

// Doubles as the create form (rendered once, always visible above the list)
// and the edit form for a single row (rendered inline when that row's
// "Editar" is clicked) — the reason there is one component file for both
// halves of "CRUD", not two. `service` present selects edit mode.
export function ServiceForm({
  service,
  onSaved,
  onCancel,
}: {
  service?: Service
  onSaved?: () => void
  onCancel?: () => void
}) {
  const formId = useId()
  const formRef = useRef<HTMLFormElement>(null)
  const isEditing = service !== undefined

  const create = useAction(createService, {
    onSuccess: ({ data }) => {
      if (data.ok) {
        formRef.current?.reset()
        onSaved?.()
      }
    },
  })
  const update = useAction(updateService, {
    onSuccess: ({ data }) => {
      if (data.ok) onSaved?.()
    },
  })

  const isExecuting = isEditing ? update.isExecuting : create.isExecuting
  const data = isEditing ? update.result.data : create.result.data
  // A validationErrors result means the submitted value bypassed the
  // mirrored HTML constraints (edited via devtools, or a client where those
  // attributes didn't apply) — next-safe-action still shapes it as field
  // errors, but this form only ever needs to say "something's off", not
  // dump which field or why.
  const validationErrors = isEditing
    ? update.result.validationErrors
    : create.result.validationErrors
  // serverError covers a thrown/unrecognized action failure — a result with
  // no `data` at all, which checking only `data && !data.ok` silently
  // ignores: the button re-enables and the customer sees nothing. The
  // underlying error text is never rendered (it can carry internals); only
  // the generic UNEXPECTED_ERROR copy is shown, through the same slot below.
  const serverError = isEditing
    ? update.result.serverError
    : create.result.serverError
  const error: UiError | undefined = serverError
    ? 'UNEXPECTED_ERROR'
    : data && !data.ok
      ? data.error
      : validationErrors
        ? 'VALIDATION_ERROR'
        : undefined

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    const description = String(formData.get('description') ?? '').trim()

    const fields = {
      name: String(formData.get('name') ?? ''),
      // null, never undefined: drizzle's .set() silently drops keys whose
      // value is undefined, so clearing an existing description on an edit
      // would otherwise leave the old value in place instead of clearing it.
      description: description === '' ? null : description,
      durationMinutes: Number(formData.get('durationMinutes')),
      bufferMinutes: Number(formData.get('bufferMinutes')),
      priceCents: reaisInputToCents(formData.get('priceReais')),
    }

    if (service) {
      update.execute({ id: service.id, ...fields })
    } else {
      create.execute(fields)
    }
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${formId}-name`}>Nome</Label>
          <Input
            id={`${formId}-name`}
            name="name"
            required
            minLength={2}
            maxLength={80}
            defaultValue={service?.name}
            placeholder="Corte de cabelo"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${formId}-description`}>Descrição (opcional)</Label>
          <Input
            id={`${formId}-description`}
            name="description"
            maxLength={280}
            defaultValue={service?.description ?? ''}
            placeholder="O que o cliente precisa saber"
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${formId}-duration`}>Duração (min)</Label>
          <Input
            id={`${formId}-duration`}
            name="durationMinutes"
            type="number"
            inputMode="numeric"
            required
            min={5}
            max={480}
            step={1}
            defaultValue={service?.durationMinutes ?? 30}
            className="tnum"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${formId}-buffer`}>Intervalo (min)</Label>
          <Input
            id={`${formId}-buffer`}
            name="bufferMinutes"
            type="number"
            inputMode="numeric"
            required
            min={0}
            max={120}
            step={1}
            defaultValue={service?.bufferMinutes ?? 0}
            className="tnum"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${formId}-price`}>Preço (R$)</Label>
          <Input
            id={`${formId}-price`}
            name="priceReais"
            type="number"
            inputMode="decimal"
            required
            min={0}
            step={0.01}
            defaultValue={
              service ? centsToReaisValue(service.priceCents) : undefined
            }
            className="tnum"
          />
        </div>
      </div>

      {error ? (
        <p role="alert" className="text-sm text-danger">
          {messageFor(error)}
        </p>
      ) : null}

      <div className="flex items-center gap-2">
        <Button type="submit" disabled={isExecuting}>
          {isExecuting
            ? 'Salvando…'
            : isEditing
              ? 'Salvar alterações'
              : 'Adicionar serviço'}
        </Button>
        {onCancel ? (
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancelar
          </Button>
        ) : null}
      </div>
    </form>
  )
}
