// Shared by every segment-scoped not-found.tsx under the public booking
// flow (src/app/a/[token], src/app/b/[slug]/confirmado) so a missing or
// forged link lands on the app's own dark theme instead of Next's default
// light-mode 404, which ignores the app's design tokens entirely.
export function NotFoundCard({ message }: { message: string }) {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center gap-2 px-4 py-16 text-center">
      <h1 className="font-display text-xl font-semibold text-fg">{message}</h1>
      <p className="text-sm text-fg-muted">
        Verifique o link recebido — ele deve ser copiado exatamente como foi
        enviado.
      </p>
    </main>
  )
}
