import { redirect } from 'next/navigation'
import { TenantSettingsForm } from '@/components/tenant-settings-form'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { getTenantById } from '@/db/queries/tenant'
import { getSession } from '@/lib/auth'

// A Server Component: the tenant row is read once per navigation here;
// only the form fields themselves are a Client Component underneath (see
// TenantSettingsForm) — same shape as ServicosPage and HorariosPage.
export default async function ConfiguracoesPage() {
  const session = await getSession()
  const tenantId = session?.user.tenantId
  if (!tenantId) redirect('/login')

  const tenant = await getTenantById(tenantId)
  if (!tenant) redirect('/login')

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-fg">
          Configurações
        </h1>
        <p className="text-sm text-fg-muted">
          Dados do negócio e as janelas de tempo que controlam agendamento e
          cancelamento.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Negócio</CardTitle>
          <CardDescription>
            Essas quatro informações valem para todo cliente que acessa seu link
            público.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <TenantSettingsForm
            name={tenant.name}
            timezone={tenant.timezone}
            minNoticeMinutes={tenant.minNoticeMinutes}
            maxAdvanceDays={tenant.maxAdvanceDays}
          />
        </CardContent>
      </Card>
    </div>
  )
}
