import type { Metadata } from 'next'
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
