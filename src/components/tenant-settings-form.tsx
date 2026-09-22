'use client'

import { useAction } from 'next-safe-action/hooks'
import { type FormEvent, useId } from 'react'
import { updateTenantSettings } from '@/actions/tenant'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { messageFor, type UiError } from '@/lib/errors'

export function TenantSettingsForm({
  name,
  timezone,
  minNoticeMinutes,
  maxAdvanceDays,
}: {
  name: string
  timezone: string
  minNoticeMinutes: number
  maxAdvanceDays: number
}) {
  const formId = useId()
  const { execute, result, isExecuting } = useAction(updateTenantSettings)

  // Same pattern every form in this codebase uses (see service-form.tsx):
  // a validationErrors result never surfaces the field it came from, only
  // the generic VALIDATION_ERROR copy — the mirrored HTML constraints
  // (min/max/required below) are what keeps a real user from tripping it in
  // the first place.
  const error: UiError | undefined = result.serverError
    ? 'UNEXPECTED_ERROR'
    : result.validationErrors
      ? 'VALIDATION_ERROR'
      : undefined
  const saved = !isExecuting && result.data?.ok === true && !error

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    execute({
      name: String(formData.get('name') ?? ''),
      timezone: String(formData.get('timezone') ?? ''),
      minNoticeMinutes: Number(formData.get('minNoticeMinutes')),
      maxAdvanceDays: Number(formData.get('maxAdvanceDays')),
    })
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${formId}-name`}>Nome do negócio</Label>
        <Input
          id={`${formId}-name`}
          name="name"
          required
          minLength={2}
          maxLength={80}
          defaultValue={name}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${formId}-timezone`}>Fuso horário</Label>
        <Input
          id={`${formId}-timezone`}
          name="timezone"
          required
          defaultValue={timezone}
          placeholder="America/Sao_Paulo"
          aria-describedby={`${formId}-timezone-hint`}
        />
        <p id={`${formId}-timezone-hint`} className="text-sm text-fg-muted">
          Identificador IANA. Todo horário mostrado ao cliente — e a agenda do
          painel — usa este fuso para converter os minutos configurados em
          "Horários" para um instante real.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${formId}-min-notice`}>
            Antecedência mínima (min)
          </Label>
          <Input
            id={`${formId}-min-notice`}
            name="minNoticeMinutes"
            type="number"
            inputMode="numeric"
            required
            min={0}
            max={20160}
            step={1}
            defaultValue={minNoticeMinutes}
            className="tnum"
            aria-describedby={`${formId}-min-notice-hint`}
          />
          <p id={`${formId}-min-notice-hint`} className="text-sm text-fg-muted">
            Este número controla duas coisas ao mesmo tempo: quanto tempo de
            antecedência um cliente precisa dar para agendar, e até quanto tempo
            antes do horário ele ainda pode cancelar sozinho. Aumentar aqui
            aperta os dois prazos juntos.
          </p>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${formId}-max-advance`}>
            Antecedência máxima (dias)
          </Label>
          <Input
            id={`${formId}-max-advance`}
            name="maxAdvanceDays"
            type="number"
            inputMode="numeric"
            required
            min={1}
            max={365}
            step={1}
            defaultValue={maxAdvanceDays}
            className="tnum"
            aria-describedby={`${formId}-max-advance-hint`}
          />
          <p
            id={`${formId}-max-advance-hint`}
            className="text-sm text-fg-muted"
          >
            Até quantos dias no futuro um cliente pode agendar.
          </p>
        </div>
      </div>

      {error ? (
        <p role="alert" className="text-sm text-danger">
          {messageFor(error)}
        </p>
      ) : null}
      {saved ? (
        <p role="status" className="text-sm text-fg-muted">
          Configurações salvas.
        </p>
      ) : null}

      <div>
        <Button type="submit" disabled={isExecuting}>
          {isExecuting ? 'Salvando…' : 'Salvar alterações'}
        </Button>
      </div>
    </form>
  )
}
