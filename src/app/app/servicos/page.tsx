import { redirect } from 'next/navigation'
import { PaywallCard } from '@/components/paywall-card'
import { ServiceForm } from '@/components/service-form'
import { ServiceList } from '@/components/service-list'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { listAllServices } from '@/db/queries/service'
import { getTenantById } from '@/db/queries/tenant'
import { PLAN_LIMITS } from '@/domain/plan'
import { getSession } from '@/lib/auth'

// A Server Component: the tenant, plan and full service list are read once
// per navigation here, and only the pieces that need interactivity (the
// create/edit form, the active switch) are Client Components underneath.
export default async function ServicosPage() {
  const session = await getSession()
  const tenantId = session?.user.tenantId
  if (!tenantId) redirect('/login')

  const tenant = await getTenantById(tenantId)
  if (!tenant) redirect('/login')

  const allServices = await listAllServices(tenantId)
  const activeCount = allServices.filter((service) => service.isActive).length
  const limit = PLAN_LIMITS[tenant.plan].maxActiveServices

  // Array.prototype.sort is stable, so within each active/inactive group
  // services keep the sortOrder the query already applied.
  const sortedServices = [...allServices].sort(
    (a, b) => Number(b.isActive) - Number(a.isActive),
  )

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-fg">
          Serviços
        </h1>
        <p className="text-sm text-fg-muted">
          O que você oferece: duração, intervalo entre atendimentos e preço.
        </p>
      </div>

      {tenant.plan === 'free' ? (
        <PaywallCard activeCount={activeCount} limit={limit} />
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Novo serviço</CardTitle>
        </CardHeader>
        <CardContent>
          <ServiceForm />
        </CardContent>
      </Card>

      {sortedServices.length === 0 ? (
        <p className="rounded-lg border border-border bg-surface p-4 text-sm text-fg-muted">
          Nenhum serviço ainda. Cadastre o primeiro para começar a receber
          agendamentos.
        </p>
      ) : (
        <ServiceList services={sortedServices} />
      )}
    </div>
  )
}
