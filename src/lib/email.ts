import { Resend } from 'resend'
import { formatFullDateTime } from '@/domain/time'
import { ConfirmationEmail } from '@/emails/confirmation'
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
// account. Both the confirmation screen (src/app/b/[slug]/confirmado) and
// the /a/[token] management page it links to (src/app/a/[token]) resolve
// this same shape, so cancelUrl is the one place that shape is written —
// no call site hand-assembles it.
export function cancelUrl(cancelToken: string): string {
  return `${env.NEXT_PUBLIC_APP_URL}/a/${cancelToken}`
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
  // Env-gated no-op: DISABLE_EMAIL_SEND is set only by the Playwright e2e
  // suite (tests/e2e/env.ts), so that no test run ever makes a real call
  // to Resend — a fake RESEND_API_KEY would still fail safely, but this
  // skips the network round-trip entirely and keeps the suite hermetic.
  // Never set in production. A dedicated flag rather than inferring this
  // from DATABASE_DRIVER, so this module's own behavior stays legible
  // without cross-referencing the db driver switch.
  if (env.DISABLE_EMAIL_SEND) {
    console.log('sendConfirmationEmail skipped (DISABLE_EMAIL_SEND=true)', {
      to: input.to,
    })
    return
  }

  const when = formatFullDateTime(input.startsAt, input.timezone)
  const manageUrl = cancelUrl(input.cancelToken)

  // Dynamically imported rather than statically at module scope: Next's
  // React Server Components bundler refuses to build any file reachable
  // from a Server Component or Server Action ('use server' — this module
  // is imported by src/actions/book-appointment.ts) that statically
  // imports react-dom/server ("component poisoning"), even though nothing
  // here ever renders into the app's own React tree — this string is only
  // ever handed to Resend. A dynamic import keeps that renderer out of the
  // static RSC module graph while still running node-side, once, the
  // first time an e-mail actually needs sending.
  //
  // Sent as both html and text (Resend accepts both together for a
  // multipart message) — html is what every modern client renders, text is
  // the fallback for the rare client that strips it, and neither depends
  // on anything the app itself serves at request time (see
  // src/emails/confirmation.tsx for why the template is self-contained).
  const { renderToStaticMarkup } = await import('react-dom/server')
  const html = `<!doctype html>${renderToStaticMarkup(
    ConfirmationEmail({
      tenantName: input.tenantName,
      serviceName: input.serviceName,
      when,
      manageUrl,
    }),
  )}`

  const text = [
    `Seu agendamento em ${input.tenantName} está confirmado.`,
    '',
    `Serviço: ${input.serviceName}`,
    `Quando: ${when}`,
    '',
    `Para ver ou cancelar o agendamento: ${manageUrl}`,
  ].join('\n')

  const { error } = await resend().emails.send({
    from: env.EMAIL_FROM,
    to: input.to,
    subject: `Agendamento confirmado — ${input.tenantName}`,
    html,
    text,
  })

  if (error) {
    throw new Error(`sendConfirmationEmail failed: ${error.message}`)
  }
}
