import Link from 'next/link'
import { notFound } from 'next/navigation'
import { AppointmentSummary } from '@/components/booking/appointment-summary'
import { CopyLinkButton } from '@/components/copy-link-button'
import { CalendarIcon, CheckIcon } from '@/components/icons'
import { getAppointmentByToken } from '@/db/queries/appointment'
import { getTenantBySlug } from '@/db/queries/tenant'
import { formatFullDateTime } from '@/domain/time'
import { buildGoogleCalendarUrl } from '@/lib/calendar-link'
import { cancelUrl } from '@/lib/email'
import { firstParam } from '@/lib/utils'

// The screen a customer lands on the instant after booking — see
// src/components/booking/booking-flow.tsx, which navigates here with
// ?token=<cancelToken> on a successful bookAppointment call instead of
// rendering a confirmation inline, precisely so this state survives a
// refresh and can be reached again from the e-mail. It is a convenience,
// not the guarantee: everything shown here (the link, the copy button) is
// the same thing the confirmation e-mail carries, because the e-mail can
// fail to arrive and the booking must not depend on it.
export default async function ConfirmadoPage({
  params,
  searchParams,
}: PageProps<'/b/[slug]/confirmado'>) {
  const { slug } = await params
  const query = await searchParams
  const token = firstParam(query.token)

  const tenant = await getTenantBySlug(slug)
  if (!tenant) notFound()

  const appointment = token ? await getAppointmentByToken(token) : undefined
  // Scoped to this tenant as well as the token: a token that resolves to a
  // different business's appointment (forged, or a copy-paste mistake)
  // must never render as if it belonged on this page.
  if (!appointment || appointment.tenantId !== tenant.id) notFound()

  const when = formatFullDateTime(appointment.startsAt, tenant.timezone)
  const manageUrl = cancelUrl(appointment.cancelToken)
  const calendarUrl = buildGoogleCalendarUrl({
    title: `${appointment.serviceName} — ${tenant.name}`,
    startsAt: appointment.startsAt,
    endsAt: appointment.endsAt,
    details: `Agendamento em ${tenant.name}. Gerenciar: ${manageUrl}`,
  })

  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center gap-5 px-4 py-10 text-center">
      <div className="flex size-14 items-center justify-center rounded-full bg-surface-raised text-fg">
        <CheckIcon className="size-7" />
      </div>

      <div>
        <h1 className="font-display text-xl font-semibold text-fg">
          Agendamento confirmado
        </h1>
        <p className="mt-1 text-sm text-fg-muted">{tenant.name}</p>
      </div>

      <AppointmentSummary
        serviceName={appointment.serviceName}
        priceCents={appointment.priceCents}
        when={when}
      />

      <a
        href={calendarUrl}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-2 rounded-md border border-border bg-surface-raised px-4 py-2 text-sm font-medium text-fg transition-colors hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
      >
        <CalendarIcon className="size-4" />
        Adicionar ao Google Agenda
      </a>

      <div className="flex w-full max-w-sm flex-col gap-2 rounded-lg border border-border bg-surface p-4 text-left">
        <p className="text-sm text-fg-muted">
          Guarde este link — é por ele que você vê ou cancela o agendamento, sem
          precisar de conta. Também enviamos os detalhes para o seu e-mail.
        </p>
        <div className="flex items-center gap-2">
          <span className="truncate text-sm text-fg" title={manageUrl}>
            {manageUrl}
          </span>
          <CopyLinkButton url={manageUrl} />
        </div>
      </div>

      <Link
        href={`/b/${slug}`}
        className="rounded-sm text-sm text-fg-muted underline underline-offset-2 hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
      >
        Fazer outro agendamento
      </Link>
    </main>
  )
}
