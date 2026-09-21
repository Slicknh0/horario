import Link from 'next/link'
import type { ReactNode } from 'react'

// Shared chrome for /login and /cadastro: the same minimal brand header the
// landing page uses, so the CTA someone just clicked on "/" doesn't drop
// them onto a page that looks like it belongs to a different product.
// Presentation only — neither page's <form> lives here.
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-border">
        <div className="mx-auto flex w-full max-w-6xl items-center px-4 py-4 sm:px-6">
          <Link
            href="/"
            className="rounded-sm font-display text-lg font-semibold text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
          >
            Horário
          </Link>
        </div>
      </header>
      <main className="flex flex-1 items-center justify-center px-4 py-12 sm:px-6">
        {children}
      </main>
    </div>
  )
}
