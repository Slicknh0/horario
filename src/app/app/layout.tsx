import { redirect } from 'next/navigation'
import { AppNav } from '@/components/app-nav'
import { CopyLinkButton } from '@/components/copy-link-button'
import { getTenantById } from '@/db/queries/tenant'
import { getSession } from '@/lib/auth'
import { env } from '@/lib/env'
import { cn } from '@/lib/utils'

// The authenticated shell every panel screen renders inside. A Server
// Component: it resolves the session and tenant once per navigation and
// never ships that lookup to the client. Only the pieces that genuinely
// need interactivity (active-nav highlighting, the copy button) are split
// out into small Client Components.
export default async function AppLayout({ children }: LayoutProps<'/app'>) {
  const session = await getSession()
  const tenantId = session?.user.tenantId
  if (!tenantId) redirect('/login')

  const tenant = await getTenantById(tenantId)
  if (!tenant) redirect('/login')

  const publicUrl = `${env.NEXT_PUBLIC_APP_URL}/b/${tenant.slug}`
  const publicUrlDisplay = publicUrl.replace(/^https?:\/\//, '')

  return (
    <div className="flex min-h-svh flex-col md:flex-row">
      <aside className="flex flex-col gap-6 border-b border-border bg-surface px-4 py-4 md:w-64 md:shrink-0 md:border-r md:border-b-0 md:px-5 md:py-6">
        <h1 className="truncate font-display text-lg font-semibold text-fg">
          {tenant.name}
        </h1>

        <AppNav />

        <div className="mt-auto flex flex-col gap-1.5 border-t border-border pt-4 md:mt-0">
          <span className="text-xs font-medium text-fg-muted">
            Link público
          </span>
          <div className="flex items-center gap-2">
            <a
              href={publicUrl}
              target="_blank"
              rel="noreferrer"
              className={cn(
                'truncate rounded-sm text-sm text-fg-muted transition-colors hover:text-fg hover:underline',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface',
              )}
            >
              {publicUrlDisplay}
            </a>
            <CopyLinkButton url={publicUrl} />
          </div>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto p-4 md:p-8">{children}</main>
    </div>
  )
}
