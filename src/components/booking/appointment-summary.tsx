const currencyFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
})

// The one appointment card both /b/[slug]/confirmado and /a/[token] show —
// same shape, since both are "here is the booking you're looking at",
// differing only in what accompanies it (a share/calendar block right
// after booking vs. a cancel action on a return visit).
export function AppointmentSummary({
  serviceName,
  priceCents,
  when,
}: {
  serviceName: string
  priceCents: number
  when: string
}) {
  return (
    <div className="w-full max-w-sm rounded-lg border border-border bg-surface p-4 text-left">
      <div className="flex items-start justify-between gap-3">
        <p className="font-medium text-fg">{serviceName}</p>
        <p className="tnum shrink-0 font-medium text-fg">
          {currencyFormatter.format(priceCents / 100)}
        </p>
      </div>
      <p className="tnum mt-1 text-sm text-fg-muted">{when}</p>
    </div>
  )
}
