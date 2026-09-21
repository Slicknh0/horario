import Link from 'next/link'
import { CalendarIcon, CheckIcon, SettingsIcon } from '@/components/icons'
import { DEMO_TENANT_SLUG } from '@/lib/demo'
import { cn } from '@/lib/utils'

const PRIMARY_CTA =
  'inline-flex h-11 items-center justify-center rounded-md bg-accent px-6 text-base font-medium text-accent-fg transition-colors hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg'

const SECONDARY_CTA =
  'inline-flex h-11 items-center justify-center rounded-md border border-border px-6 text-base font-medium text-fg transition-colors hover:bg-surface-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg'

// A static, illustrative slice of a day's agenda — not real tenant data —
// used to show what "agenda online" actually looks like instead of
// describing it in the abstract. The two open gaps are deliberate: a real
// day has holes in it, not a uniform grid.
const AGENDA_PREVIEW = [
  { time: '09:00', label: 'Corte — Lucas A.', free: false },
  { time: '09:45', label: 'Barba — Rafael L.', free: false },
  { time: '10:15', label: 'Horário livre', free: true },
  { time: '10:30', label: 'Corte + Barba — Camila F.', free: false },
  { time: '11:45', label: 'Horário livre', free: true },
] as const

const FEATURES = [
  {
    icon: CalendarIcon,
    title: 'Agenda online',
    description:
      'Seus clientes veem os horários livres e marcam pelo celular, sem baixar aplicativo nem trocar mensagem.',
  },
  {
    icon: SettingsIcon,
    title: 'Horários configuráveis',
    description:
      'Defina o expediente de cada dia da semana, com intervalo de almoço, folgas e horários especiais quando precisar.',
  },
  {
    icon: CheckIcon,
    title: 'Cancelamento pelo cliente',
    description:
      'O cliente cancela ou reagenda sozinho pelo link da confirmação, e o horário volta a ficar livre na hora.',
  },
] as const

export default function LandingPage() {
  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-border">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
          <span className="font-display text-lg font-semibold text-fg">
            Horário
          </span>
          <Link
            href="/login"
            className="text-sm font-medium text-fg-muted transition-colors hover:text-fg"
          >
            Entrar
          </Link>
        </div>
      </header>

      <main className="flex-1">
        <section className="mx-auto grid w-full max-w-6xl items-center gap-12 px-4 py-16 sm:px-6 sm:py-24 lg:grid-cols-[1.1fr_0.9fr] lg:py-28">
          <div className="flex flex-col items-start">
            <h1 className="max-w-xl font-display text-4xl font-semibold leading-[1.08] tracking-tight text-fg sm:text-5xl lg:text-[3.25rem]">
              Marcação de horário sem trocar uma mensagem.
            </h1>
            <p className="mt-5 max-w-md text-lg leading-relaxed text-fg-muted">
              Horário é a agenda online para barbearias e salões de beleza. O
              cliente escolhe o serviço, vê os horários livres e confirma
              sozinho — você só corta o cabelo.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link href={`/b/${DEMO_TENANT_SLUG}`} className={SECONDARY_CTA}>
                Ver demonstração
              </Link>
              <Link href="/cadastro" className={PRIMARY_CTA}>
                Criar minha conta
              </Link>
            </div>
            <p className="mt-4 text-sm text-fg-muted">
              Grátis para começar. Sem cartão de crédito.
            </p>
          </div>

          <div className="w-full rounded-xl border border-border bg-surface p-5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium text-fg-muted">
                Exemplo de agenda
              </p>
              <CalendarIcon className="size-4 text-fg-muted" />
            </div>
            <ul className="mt-4 flex flex-col gap-2">
              {AGENDA_PREVIEW.map((slot) => (
                <li
                  key={slot.time}
                  className={cn(
                    'flex items-center gap-3 rounded-lg border px-3 py-2.5',
                    slot.free
                      ? 'border-dashed border-border text-fg-muted'
                      : 'border-border bg-surface-raised text-fg',
                  )}
                >
                  <span className="tnum text-sm font-medium">{slot.time}</span>
                  <span className="flex-1 truncate text-sm text-fg-muted">
                    {slot.label}
                  </span>
                  {slot.free ? null : (
                    <span
                      aria-hidden="true"
                      className="size-1.5 shrink-0 rounded-full bg-accent"
                    />
                  )}
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="border-t border-border">
          <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
            <h2 className="mx-auto max-w-xl text-center font-display text-2xl font-semibold text-fg sm:text-3xl">
              O que muda no seu dia a dia
            </h2>

            <div className="mt-10 grid gap-6 sm:grid-cols-3">
              {FEATURES.map(({ icon: Icon, title, description }) => (
                <div
                  key={title}
                  className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-6"
                >
                  <span className="flex size-9 items-center justify-center rounded-md bg-surface-raised text-accent">
                    <Icon className="size-5" />
                  </span>
                  <h3 className="font-display text-lg font-semibold text-fg">
                    {title}
                  </h3>
                  <p className="text-sm leading-relaxed text-fg-muted">
                    {description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="border-t border-border">
          <div className="mx-auto flex w-full max-w-6xl flex-col items-center px-4 py-16 text-center sm:px-6 sm:py-20">
            <h2 className="font-display text-2xl font-semibold text-fg sm:text-3xl">
              Pronto para organizar sua semana?
            </h2>
            <p className="mt-3 max-w-md text-fg-muted">
              Veja como fica a agenda de uma barbearia de verdade, ou crie sua
              conta agora.
            </p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <Link href={`/b/${DEMO_TENANT_SLUG}`} className={SECONDARY_CTA}>
                Ver demonstração
              </Link>
              <Link href="/cadastro" className={PRIMARY_CTA}>
                Criar minha conta
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto w-full max-w-6xl px-4 py-8 text-center text-sm text-fg-muted sm:px-6">
          © {new Date().getFullYear()} Horário — agendamento online para
          barbearias e salões de beleza.
        </div>
      </footer>
    </div>
  )
}
