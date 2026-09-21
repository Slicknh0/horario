import { redirect } from 'next/navigation'
import { ExceptionsEditor } from '@/components/exceptions-editor'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { WeeklyHoursEditor } from '@/components/weekly-hours-editor'
import { listExceptions, listWeeklyHours } from '@/db/queries/availability'
import { getSession } from '@/lib/auth'

// A Server Component: the tenant's weekly hours and exceptions are read
// once per navigation here; only the per-row editing (adding an interval,
// flipping the closed switch) is a Client Component underneath.
export default async function HorariosPage() {
  const session = await getSession()
  const tenantId = session?.user.tenantId
  if (!tenantId) redirect('/login')

  const [hoursByWeekday, exceptions] = await Promise.all([
    listWeeklyHours(tenantId),
    listExceptions(tenantId),
  ])

  const hasAnyHours = Object.values(hoursByWeekday).some(
    (ranges) => ranges.length > 0,
  )

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-fg">
          Horários
        </h1>
        <p className="text-sm text-fg-muted">
          Quando o seu negócio atende. Ninguém consegue agendar fora desses
          horários.
        </p>
      </div>

      {!hasAnyHours ? (
        <p
          role="status"
          className="rounded-lg border border-danger bg-surface p-4 text-sm text-danger"
        >
          Nenhum horário configurado ainda. Enquanto nenhum dia tiver um
          intervalo salvo abaixo, ninguém consegue agendar com você.
        </p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Horário semanal</CardTitle>
          <CardDescription>
            Adicione um segundo intervalo no mesmo dia para reabrir depois do
            almoço — não existe um campo separado para isso, "adicionar
            intervalo" é como um intervalo de almoço é representado.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <WeeklyHoursEditor hoursByWeekday={hoursByWeekday} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Exceções por data</CardTitle>
          <CardDescription>
            Feriados e datas com horário diferente do normal.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ExceptionsEditor
            exceptions={exceptions.map((exception) => ({
              date: exception.date,
              isClosed: exception.isClosed,
              startMinute: exception.startMinute,
              endMinute: exception.endMinute,
            }))}
          />
        </CardContent>
      </Card>
    </div>
  )
}
