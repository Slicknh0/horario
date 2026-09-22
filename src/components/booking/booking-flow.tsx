'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAction } from 'next-safe-action/hooks'
import {
  type FormEvent,
  type MouseEvent,
  useId,
  useState,
  useTransition,
} from 'react'
import { bookAppointment } from '@/actions/book-appointment'
import { DateStrip } from '@/components/booking/date-strip'
import { ServiceCard } from '@/components/booking/service-card'
import { SlotGrid } from '@/components/booking/slot-grid'
import { CheckIcon } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { Service } from '@/db/queries/service'
import type { LocalDate, Slot } from '@/domain/types'
import { messageFor } from '@/lib/errors'
import { isPlainLeftClick } from '@/lib/utils'

const currencyFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
})

function formatStartsAt(startsAt: Date, timezone: string): string {
  const day = new Intl.DateTimeFormat('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    timeZone: timezone,
  }).format(startsAt)
  const time = new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: timezone,
  }).format(startsAt)
  return `${day} às ${time}`
}

function EmptyState({ message }: { message: string }) {
  return (
    <p className="rounded-lg border border-border bg-surface p-4 text-sm text-fg-muted">
      {message}
    </p>
  )
}

function ConfirmationScreen({
  slug,
  tenantName,
  serviceName,
  startsAt,
  timezone,
  token,
}: {
  slug: string
  tenantName: string
  serviceName: string
  startsAt: Date
  timezone: string
  token: string
}) {
  return (
    <div className="flex flex-col items-center gap-4 py-10 text-center">
      <div className="flex size-14 items-center justify-center rounded-full bg-surface-raised text-fg">
        <CheckIcon className="size-7" />
      </div>
      <div>
        <h2 className="font-display text-xl font-semibold text-fg">
          Agendamento confirmado
        </h2>
        <p className="mt-1 text-sm text-fg-muted">{tenantName}</p>
      </div>
      <div className="w-full max-w-sm rounded-lg border border-border bg-surface p-4 text-left">
        <p className="font-medium text-fg">{serviceName}</p>
        <p className="tnum text-sm text-fg-muted">
          {formatStartsAt(startsAt, timezone)}
        </p>
      </div>
      <p className="max-w-sm text-sm text-fg-muted">
        Enviamos os detalhes para o seu e-mail. Guarde o link abaixo — é por ele
        que você vê ou cancela o agendamento, sem precisar de conta.
      </p>
      <Link
        href={`/a/${token}`}
        className="rounded-sm text-sm font-medium text-fg underline underline-offset-2 hover:text-fg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
      >
        Ver ou cancelar agendamento
      </Link>
      <Link
        href={`/b/${slug}`}
        className="rounded-sm text-sm text-fg-muted hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
      >
        Fazer outro agendamento
      </Link>
    </div>
  )
}

type DayOption = { date: LocalDate; hasSlots: boolean }

// Step state (which service, which day) lives in the URL and is rendered by
// the Server Component page — this component only owns what genuinely can't
// live there: the picked time-of-day (ambiguous to share, since it may be
// taken by the time a link is opened) and the contact form. The page keys
// this component by `${servico}-${data}` so switching either one always
// starts this local state fresh instead of carrying a stale slot selection
// across a navigation.
export function BookingFlow({
  slug,
  tenantName,
  services,
  hasAnyWeeklyHours,
  timezone,
  today,
  selectedDate,
  selectedService,
  dayOptions,
  slots,
}: {
  slug: string
  tenantName: string
  services: Service[]
  hasAnyWeeklyHours: boolean
  timezone: string
  today: LocalDate
  selectedDate: LocalDate
  selectedService: Service | undefined
  dayOptions: DayOption[]
  slots: Slot[]
}) {
  const router = useRouter()
  const formId = useId()
  const [selectedSlotIso, setSelectedSlotIso] = useState<string | undefined>(
    undefined,
  )
  // React-owned pending state for the day/service navigation below, NOT a
  // hand-tracked boolean: an earlier version of this fix used a plain
  // `useState` flag set on click and relied entirely on BookingFlow's
  // `${service}-${date}` key changing (see the class comment above) to
  // reset it via remount. That reset path doesn't fire for every ordinary
  // interaction — pressing Back before the navigation resolves returns to
  // this same key, re-clicking the already-in-flight day is a no-op change
  // to begin with, and a slow/aborted transition just leaves the old
  // instance on screen — so the flag could get stuck permanently armed,
  // disabling every slot until a hard reload: a strictly worse, permanent
  // version of the race it was meant to fix. `useTransition`'s `isPending`
  // has none of that: React clears it whenever the transition this
  // `startTransition` call scheduled commits, is superseded by a newer
  // update (including the router's own handling of a back/forward
  // navigation), or the underlying render errors — by construction, not
  // by us remembering every case that should clear it.
  const [isPending, startTransition] = useTransition()

  function navigate(href: string) {
    startTransition(() => {
      router.push(href)
    })
  }

  // Shared by DateStrip's day links and the "Trocar" (switch service) link
  // below — both change this component's `key`, and Next's client-side
  // transitions deliberately keep the OUTGOING page fully interactive
  // while the new one loads (that's what makes navigation feel instant —
  // see node_modules/next/dist/docs/01-app/01-getting-started/04-linking-and-navigating.md,
  // "Client-side transitions": "Keeping any shared layouts and UI"). Without
  // `isPending` gating SlotGrid (below), a click landing on this still-live
  // grid in that window sets `selectedSlotIso` to a slot from the day/
  // service being left, moments before the remount silently discards it —
  // the customer's tap on a visible, enabled time slot does nothing (this
  // is what tests/e2e/agenda.spec.ts and booking.spec.ts caught: a slot
  // click landing on the previous day's still-present grid before the
  // newly selected day's grid replaced it).
  function handleTrocarClick(event: MouseEvent<HTMLAnchorElement>) {
    if (!isPlainLeftClick(event)) return
    event.preventDefault()
    navigate(`/b/${slug}`)
  }

  const { execute, result, isExecuting, reset } = useAction(bookAppointment, {
    onSuccess: ({ data }) => {
      if (!data.ok) {
        // Never leave a broken/stale selection standing: re-picking a time
        // is always required after any failure. SLOT_TAKEN specifically
        // means the day's slot list itself is stale, so that one also
        // triggers a refetch of the Server Component data (same URL, fresh
        // props) rather than just a local state reset.
        setSelectedSlotIso(undefined)
        if (data.error === 'SLOT_TAKEN') router.refresh()
      }
    },
  })

  function handleSelectSlot(iso: string) {
    // Defense in depth: SlotGrid's `disabled` prop (driven by isPending)
    // already makes the underlying radio buttons non-interactive while
    // this is true, so a real click can't reach here — but onValueChange
    // is a public callback prop, not something only a mouse click can
    // invoke, so this stays correct regardless of how it gets called.
    if (isPending) return
    setSelectedSlotIso(iso)
    reset()
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selectedService || !selectedSlotIso) return
    const formData = new FormData(event.currentTarget)
    execute({
      slug,
      serviceId: selectedService.id,
      startsAt: new Date(selectedSlotIso),
      customerName: String(formData.get('customerName') ?? ''),
      customerEmail: String(formData.get('customerEmail') ?? ''),
      customerPhone: String(formData.get('customerPhone') ?? ''),
      website: String(formData.get('website') ?? ''),
    })
  }

  if (services.length === 0) {
    return (
      <EmptyState message="Este estabelecimento ainda não cadastrou serviços." />
    )
  }

  if (!hasAnyWeeklyHours) {
    return (
      <EmptyState message="Ainda não há horários disponíveis para agendamento." />
    )
  }

  if (result.data?.ok && selectedSlotIso) {
    return (
      <ConfirmationScreen
        slug={slug}
        tenantName={tenantName}
        serviceName={selectedService?.name ?? ''}
        startsAt={new Date(selectedSlotIso)}
        timezone={timezone}
        token={result.data.token}
      />
    )
  }

  if (!selectedService) {
    return (
      <div className="flex flex-col gap-3">
        <h2 className="font-display text-lg font-semibold text-fg">
          Escolha um serviço
        </h2>
        <ul className="flex flex-col gap-2">
          {services.map((service) => (
            <li key={service.id}>
              <ServiceCard
                service={service}
                href={`/b/${slug}?servico=${service.id}`}
              />
            </li>
          ))}
        </ul>
      </div>
    )
  }

  // result.serverError covers a thrown/unrecognized action failure (a bug,
  // a transient DB/network error, a cause chain deeper than
  // isOverlapViolation's walk) — a case with no `data` at all, which the
  // earlier `result.data && !result.data.ok` check alone silently ignored:
  // the spinner would stop and the customer would see nothing, on the one
  // screen where that reads as "this business is broken". The underlying
  // serverError text is deliberately never rendered — it can carry
  // internals — only the generic UNEXPECTED_ERROR copy is shown, through
  // the same error slot every domain error already uses.
  const actionError = result.serverError
    ? ('UNEXPECTED_ERROR' as const)
    : result.data && !result.data.ok
      ? result.data.error
      : undefined

  return (
    <div className="flex flex-col gap-5 pb-32">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm text-fg-muted">Serviço selecionado</p>
          <p className="font-medium text-fg">
            {selectedService.name}{' '}
            <span className="tnum text-fg-muted">
              · {currencyFormatter.format(selectedService.priceCents / 100)}
            </span>
          </p>
        </div>
        <Link
          href={`/b/${slug}`}
          onClick={handleTrocarClick}
          className="shrink-0 rounded-sm text-sm text-fg-muted underline underline-offset-2 hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
        >
          Trocar
        </Link>
      </div>

      <DateStrip
        slug={slug}
        serviceId={selectedService.id}
        days={dayOptions}
        selectedDate={selectedDate}
        today={today}
        onNavigate={navigate}
      />

      {actionError ? (
        <p role="alert" className="text-sm text-danger">
          {messageFor(actionError)}
        </p>
      ) : null}

      {slots.length === 0 ? (
        <EmptyState message="Sem horários livres neste dia." />
      ) : (
        <SlotGrid
          slots={slots}
          timezone={timezone}
          value={selectedSlotIso}
          onValueChange={handleSelectSlot}
          disabled={isPending}
        />
      )}

      {selectedSlotIso ? (
        <form
          onSubmit={handleSubmit}
          className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-4"
        >
          <h3 className="font-display text-base font-semibold text-fg">
            Seus dados
          </h3>

          {/* Honeypot: visually hidden via the codebase's existing .sr-only
              pattern (see date-strip.tsx) rather than display:none, since
              some bots skip fields hidden that way. A human never sees or
              reaches it via Tab. */}
          <div className="sr-only" aria-hidden="true">
            <label htmlFor={`${formId}-website`}>Não preencha este campo</label>
            <input
              id={`${formId}-website`}
              name="website"
              type="text"
              tabIndex={-1}
              autoComplete="off"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${formId}-name`}>Nome completo</Label>
            <Input
              id={`${formId}-name`}
              name="customerName"
              required
              minLength={2}
              maxLength={80}
              autoComplete="name"
              placeholder="Seu nome"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${formId}-email`}>E-mail</Label>
            <Input
              id={`${formId}-email`}
              name="customerEmail"
              type="email"
              inputMode="email"
              required
              autoComplete="email"
              placeholder="voce@email.com"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${formId}-phone`}>Telefone (WhatsApp)</Label>
            <Input
              id={`${formId}-phone`}
              name="customerPhone"
              type="tel"
              inputMode="tel"
              required
              minLength={10}
              maxLength={20}
              autoComplete="tel"
              placeholder="(11) 99999-9999"
            />
          </div>

          <div className="fixed inset-x-0 bottom-0 z-10 border-t border-border bg-surface p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <div className="mx-auto max-w-xl">
              <Button
                type="submit"
                size="lg"
                // The shared Button's `lg` size is 40px tall — one below
                // the 44px minimum touch target this page requires for its
                // one unavoidable tap. Overridden here rather than in the
                // shared primitive, since other call sites of `lg` aren't
                // a phone's one-thumb primary action.
                className="h-12 w-full"
                disabled={isExecuting}
              >
                {isExecuting ? 'Confirmando…' : 'Confirmar agendamento'}
              </Button>
            </div>
          </div>
        </form>
      ) : null}
    </div>
  )
}
