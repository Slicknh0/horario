'use client'

import * as SwitchPrimitive from '@radix-ui/react-switch'
import * as React from 'react'
import { cn } from '@/lib/utils'

// Built on Radix rather than hand-rolled: a plain styled <div onClick> loses
// keyboard support (Space/Enter, Tab focus order) and never gets a real
// aria-checked, which is exactly why the earlier hand-rolled primitives in
// this project were deleted.
//
// Track and thumb both switch color by state instead of relying on one
// fixed thumb fill against two different track colors: fg-on-surface-raised
// and accent-fg-on-accent are the only two pairs here, and both are already
// measured in tests/design/contrast.test.ts, so no new pairing needed adding
// there.
export const Switch = React.forwardRef<
  React.ComponentRef<typeof SwitchPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>
>(({ className, ...props }, ref) => (
  <SwitchPrimitive.Root
    ref={ref}
    className={cn(
      'peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border border-border bg-surface-raised transition-colors',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface',
      'disabled:cursor-not-allowed disabled:opacity-50',
      'data-[state=checked]:border-accent data-[state=checked]:bg-accent',
      className,
    )}
    {...props}
  >
    <SwitchPrimitive.Thumb
      className={cn(
        'pointer-events-none block size-3.5 translate-x-0.5 rounded-full bg-fg transition-transform',
        'data-[state=checked]:translate-x-[1.125rem] data-[state=checked]:bg-accent-fg',
      )}
    />
  </SwitchPrimitive.Root>
))
Switch.displayName = 'Switch'
