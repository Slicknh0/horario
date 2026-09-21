'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

// Hand-rolled rather than pulled from a headless-UI package: a toggle is
// exactly a <button role="switch">, and the state contrast is drawn
// straight from the token contract (accent-fg was defined to sit on
// accent; fg was already verified against surface-raised).
export interface SwitchProps {
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  disabled?: boolean
  id?: string
  className?: string
  'aria-label'?: string
  'aria-labelledby'?: string
}

export const Switch = React.forwardRef<HTMLButtonElement, SwitchProps>(
  ({ checked, onCheckedChange, disabled, id, className, ...aria }, ref) => {
    return (
      <button
        ref={ref}
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onCheckedChange(!checked)}
        className={cn(
          'inline-flex h-5 w-9 shrink-0 items-center rounded-full border border-border p-0.5 transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
          'disabled:cursor-not-allowed disabled:opacity-50',
          checked ? 'bg-accent' : 'bg-surface-raised',
          className,
        )}
        {...aria}
      >
        <span
          className={cn(
            'block size-4 rounded-full transition-transform',
            checked ? 'translate-x-4 bg-accent-fg' : 'translate-x-0 bg-fg',
          )}
        />
      </button>
    )
  },
)
Switch.displayName = 'Switch'
