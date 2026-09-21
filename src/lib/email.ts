import { Resend } from 'resend'
import { env } from '@/lib/env'

// Lazily constructed: importing this module must never throw before a send
// is actually attempted (e.g. in a build step that only type-checks the
// action that imports it).
let client: Resend | null = null
function resend(): Resend {
  client ??= new Resend(env.RESEND_API_KEY)
  return client
}

// The customer's one-and-only way to manage the booking without an
// account — kept alongside the e-mail because both the confirmation screen
// (src/components/booking/booking-flow.tsx) and this message point at the
// same URL shape. Task 11 builds the page this resolves to.
export function cancelUrl(cancelToken: string): string {
  return `${env.NEXT_PUBLIC_APP_URL}/cancelar/${cancelToken}`
}

function formatStartsAt(startsAt: Date, timezone: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'full',
    timeStyle: 'short',
    timeZone: timezone,
  }).format(startsAt)
}

// Sent after the booking already committed (see src/actions/book-appointment.ts).
// Throws on failure so the caller's `.catch()` can log it — the booking
// itself must never be undone by an e-mail problem, and the confirmation
// screen shows the same management link regardless of whether this
// succeeds, so a thrown/caught error here is never user-visible.
export async function sendConfirmationEmail(input: {
  to: string
  tenantName: string
  serviceName: string
  startsAt: Date
  timezone: string
  cancelToken: string
}): Promise<void> {
  const when = formatStartsAt(input.startsAt, input.timezone)
  const manageUrl = cancelUrl(input.cancelToken)

  const { error } = await resend().emails.send({
    from: env.EMAIL_FROM,
    to: input.to,
    subject: `Agendamento confirmado — ${input.tenantName}`,
    text: [
      `Seu agendamento em ${input.tenantName} está confirmado.`,
      '',
      `Serviço: ${input.serviceName}`,
      `Quando: ${when}`,
      '',
      `Para ver ou cancelar o agendamento: ${manageUrl}`,
    ].join('\n'),
  })

  if (error) {
    throw new Error(`sendConfirmationEmail failed: ${error.message}`)
  }
}
