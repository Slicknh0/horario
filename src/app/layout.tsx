import type { Metadata, Viewport } from 'next'
import { Bricolage_Grotesque, Geist } from 'next/font/google'
import './globals.css'

// Named after the @theme tokens that consume them (--font-sans,
// --font-display) rather than the create-next-app default
// (--font-geist-sans), so globals.css can wrap each in var(...) with the
// same fallback stack the design brief specifies, and next/font's
// self-hosted font actually renders instead of silently falling back to
// system-ui.
const geistSans = Geist({
  variable: '--font-sans-loaded',
  subsets: ['latin'],
})

const bricolageGrotesque = Bricolage_Grotesque({
  variable: '--font-display-loaded',
  subsets: ['latin'],
})

export const metadata: Metadata = {
  title: 'Horário',
  description: 'Agendamento online para barbearias e salões de beleza.',
}

// Explicit rather than left to Next's implicit default: the 390px mobile
// Playwright project (playwright.config.ts) caught that Next re-renders
// (removes and recreates) the <meta name="viewport"> element on every
// client-side navigation — and a browser only honors that tag as parsed
// with the INITIAL document, never a dynamically re-inserted one, per the
// HTML spec. Without a static export here, every soft navigation on
// /b/[slug] (choosing a service, changing date — the page's two core
// interactions) silently fell back to Chromium's ~980px "not
// mobile-optimized" layout viewport: media queries stopped matching their
// intended breakpoint, coordinates Playwright (and a real pinch-zoomed
// phone) compute against the visual viewport stopped lining up with the
// actual DOM, and "Confirmar agendamento" became unclickable. An explicit
// static `viewport` export is the one shape Next's metadata layer keeps
// stable in place across a soft navigation instead of tearing down.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html
      lang="pt-BR"
      className={`${geistSans.variable} ${bricolageGrotesque.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  )
}
