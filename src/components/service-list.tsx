'use client'

import { useAction } from 'next-safe-action/hooks'
import { useState } from 'react'
import { setServiceActive } from '@/actions/service'
import { ServiceForm } from '@/components/service-form'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import type { Service } from '@/db/queries/service'
import { messageFor } from '@/lib/errors'

const currencyFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
})

function ServiceRow({ service }: { service: Service }) {
  const [isEditing, setIsEditing] = useState(false)
  const { execute, result, isExecuting } = useAction(setServiceActive)

  // result.serverError covers a thrown/unrecognized action failure — a
  // result with no `data` at all. Checking only `data && !data.ok` missed
  // it: the switch would silently snap back to its previous state with no
  // explanation, same as the identical gap fixed in booking-flow.tsx and
  // service-form.tsx.
  const toggleError = result.serverError
    ? ('UNEXPECTED_ERROR' as const)
    : result.data && !result.data.ok
      ? result.data.error
      : undefined

  if (isEditing) {
    return (
      <li className="rounded-lg border border-border bg-surface p-4">
        <ServiceForm
          service={service}
          onSaved={() => setIsEditing(false)}
          onCancel={() => setIsEditing(false)}
        />
      </li>
    )
  }

  return (
    <li className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-col gap-0.5">
        <span className="font-medium text-fg">{service.name}</span>
        {service.description ? (
          <span className="text-sm text-fg-muted">{service.description}</span>
        ) : null}
        <span className="tnum text-sm text-fg-muted">
          {service.durationMinutes} min · {service.bufferMinutes} min de
          intervalo · {currencyFormatter.format(service.priceCents / 100)}
        </span>
        {/* Never rely on the switch's color alone to say active/inactive. */}
        {toggleError ? (
          <span role="alert" className="text-sm text-danger">
            {messageFor(toggleError)}
          </span>
        ) : null}
      </div>

      <div className="flex shrink-0 items-center gap-4">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setIsEditing(true)}
        >
          Editar
        </Button>
        <div className="flex items-center gap-2">
          <span className="text-sm text-fg-muted">
            {service.isActive ? 'Ativo' : 'Inativo'}
          </span>
          <Switch
            checked={service.isActive}
            disabled={isExecuting}
            onCheckedChange={(checked) =>
              execute({ id: service.id, isActive: checked })
            }
            aria-label={
              service.isActive
                ? `Desativar ${service.name}`
                : `Ativar ${service.name}`
            }
          />
        </div>
      </div>
    </li>
  )
}

export function ServiceList({ services }: { services: Service[] }) {
  return (
    <ul className="flex flex-col gap-3">
      {services.map((service) => (
        <ServiceRow key={service.id} service={service} />
      ))}
    </ul>
  )
}
