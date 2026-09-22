import { NotFoundCard } from '@/components/not-found-card'

// The catch-all for any route that either calls notFound() with no
// closer-scoped not-found.tsx above it in the tree (e.g. src/app/b/[slug]/
// page.tsx — an unknown shop slug is the single most-shared URL this
// product produces) or simply doesn't exist at all. Without this, both
// cases fell through to Next's own English, light-mode default 404 —
// exactly the defect already fixed once for /a/[token] and once for
// /b/[slug]/confirmado, just never generalized.
export default function NotFound() {
  return <NotFoundCard message="Página não encontrada." />
}
