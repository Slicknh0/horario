import * as React from 'react'
import { cn } from '@/lib/utils'

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, ...props }, ref) => {
  return (
    <input
      ref={ref}
      className={cn(
        // text-base (16px) below the sm breakpoint, not text-sm (14px):
        // Chromium and Safari both auto-zoom the page on focusing a text
        // input smaller than 16px on a touch device, which on this app's
        // one fixed-position mobile CTA (the booking form's submit button,
        // src/components/booking/booking-flow.tsx) desyncs the visual
        // viewport from the layout viewport Playwright's click() computes
        // coordinates against — caught by the 390px mobile Playwright
        // project (playwright.config.ts) filling the booking form and then
        // being unable to click "Confirmar agendamento" at all.
        'flex h-9 w-full rounded-md border border-border bg-surface px-3 py-1 text-base text-fg outline-none transition-colors sm:text-sm',
        'placeholder:text-fg-muted',
        'focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
        'disabled:cursor-not-allowed disabled:opacity-50',
        'aria-invalid:border-danger',
        className,
      )}
      {...props}
    />
  )
})
Input.displayName = 'Input'
