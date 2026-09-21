import { notFound } from 'next/navigation'
import { AppointmentSummary } from '@/components/booking/appointment-summary'
import { CancelAppointmentPanel } from '@/components/booking/cancel-appointment-panel'
import { getAppointmentByToken } from '@/db/queries/appointment'
import { getTenantById } from '@/db/queries/tenant'
import { canCancel } from '@/domain/cancellation'
import { formatFullDateTime } from '@/domain/time'
import { messageFor } from '@/lib/errors'

// The one link a customer keeps for as long as the appointment exists (see
// the confirmation e-mail and the /b/[slug]/confirmado screen, both of
// which point here). A token that doesn't resolve to a row — unknown,
// malformed, or simply guessed — renders the exact same "não encontramos"
// 404 as any other unknown token: this route must never let a visitor
// distinguish "never existed" from "exists but I can't see it", so no
// branch here is allowed to leak more detail than notFound() already
// gives. A token that DOES resolve is a different case entirely — that
// visitor holds a real link and is owed the truth about what happened to
// their booking, however unwelcome (already cancelled, past the
// cancellation deadline).
export default async function ManageAppointmentPage({
  params,
}: PageProps<'/a/[token]'>) {
  const { token } = await params

  const appointment = await getAppointmentByToken(token)
  if (!appointment) notFound()

  const tenant = await getTenantById(appointment.tenantId)
  // Invariant, not a user-facing case: appointments.tenant_id is a
  // non-nullable FK, so a resolved appointment always has a tenant row.
  if (!tenant) notFound()

  const when = formatFullDateTime(appointment.startsAt, tenant.timezone)

  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-5 px-4 py-10">
      <header>
        <h1 className="font-display text-xl font-semibold text-fg">
          Seu agendamento
        </h1>
        <p className="mt-1 text-sm text-fg-muted">{tenant.name}</p>
      </header>

      <AppointmentSummary
        serviceName={appointment.serviceName}
        priceCents={appointment.priceCents}
        when={when}
      />

      {appointment.status === 'cancelled' ? (
        <div className="rounded-lg border border-border bg-surface p-4">
          <p className="font-medium text-fg">Este agendamento foi cancelado</p>
          {appointment.cancelledAt ? (
            <p className="tnum mt-1 text-sm text-fg-muted">
              em {formatFullDateTime(appointment.cancelledAt, tenant.timezone)}
            </p>
          ) : null}
        </div>
      ) : (
        (() => {
          const allowed = canCancel({
            status: appointment.status,
            startsAt: appointment.startsAt,
            now: new Date(),
            minNoticeMinutes: tenant.minNoticeMinutes,
          })
          return allowed.ok ? (
            <CancelAppointmentPanel token={appointment.cancelToken} />
          ) : (
            <p className="text-sm text-fg-muted">{messageFor(allowed.error)}</p>
          )
        })()
      )}
    </main>
  )
}
