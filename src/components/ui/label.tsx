import * as React from 'react'
import { cn } from '@/lib/utils'

export const Label = React.forwardRef<
  HTMLLabelElement,
  React.LabelHTMLAttributes<HTMLLabelElement>
>(({ className, ...props }, ref) => (
  // This primitive spreads props; every call site supplies htmlFor (or
  // wraps the control as children).
  // biome-ignore lint/a11y/noLabelWithoutControl: see comment above
  <label
    ref={ref}
    className={cn(
      'text-sm leading-none font-medium text-fg',
      'peer-disabled:cursor-not-allowed peer-disabled:opacity-50',
      className,
    )}
    {...props}
  />
))
Label.displayName = 'Label'
