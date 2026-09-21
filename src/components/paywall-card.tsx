export function PaywallCard({
  activeCount,
  limit,
}: {
  activeCount: number
  limit: number
}) {
  return (
    <div className="rounded-lg border border-border bg-surface-raised p-4">
      <p className="font-display text-lg">
        <span className="tnum">
          {activeCount}/{limit}
        </span>{' '}
        serviços ativos
      </p>
      <p className="mt-1 text-sm text-fg-muted">
        O plano gratuito permite {limit} serviços ativos. Desative um para
        liberar espaço.
      </p>
      <button
        type="button"
        disabled
        className="mt-3 rounded-md bg-accent px-3 py-2 text-accent-fg opacity-50"
        title="Em breve"
      >
        Fazer upgrade
      </button>
    </div>
  )
}
