import * as React from 'react'
import { cn } from '@/lib/utils'

const BUTTON_VARIANTS = {
  default: 'bg-accent text-accent-fg hover:opacity-90',
  secondary:
    'border border-border bg-surface-raised text-fg hover:bg-surface-raised/70',
  outline:
    'border border-border bg-transparent text-fg hover:bg-surface-raised',
  ghost: 'bg-transparent text-fg hover:bg-surface-raised',
  destructive: 'bg-danger text-fg hover:opacity-90',
  link: 'h-auto bg-transparent p-0 text-accent underline-offset-4 hover:underline',
} as const

const BUTTON_SIZES = {
  default: 'h-9 px-4 text-sm',
  sm: 'h-8 px-3 text-sm',
  lg: 'h-10 px-6 text-base',
  icon: 'h-9 w-9 shrink-0',
} as const

export type ButtonVariant = keyof typeof BUTTON_VARIANTS
export type ButtonSize = keyof typeof BUTTON_SIZES

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = 'default',
      size = 'default',
      type = 'button',
      ...props
    },
    ref,
  ) => {
    return (
      <button
        ref={ref}
        type={type}
        className={cn(
          'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
          'disabled:pointer-events-none disabled:opacity-50',
          BUTTON_VARIANTS[variant],
          BUTTON_SIZES[size],
          className,
        )}
        {...props}
      />
    )
  },
)
Button.displayName = 'Button'
