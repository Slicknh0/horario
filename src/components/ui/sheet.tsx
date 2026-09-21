'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'
import {
  Dialog,
  DialogClose,
  DialogTrigger,
  useNativeDialogSync,
} from './dialog'

// A Sheet is a Dialog anchored to a viewport edge instead of centered: same
// native <dialog> mechanics (top layer, focus trap, Escape-to-close), a
// different resting position.
export const Sheet = Dialog
export const SheetTrigger = DialogTrigger
export const SheetClose = DialogClose

export type SheetSide = 'right' | 'left'

export interface SheetContentProps
  extends React.HTMLAttributes<HTMLDivElement> {
  side?: SheetSide
}

export const SheetContent = React.forwardRef<HTMLDivElement, SheetContentProps>(
  ({ className, children, side = 'right', ...props }, ref) => {
    const dialogRef = React.useRef<HTMLDialogElement>(null)
    useNativeDialogSync(dialogRef)

    return (
      <dialog
        ref={dialogRef}
        className={cn(
          'm-0 h-full max-h-none w-full max-w-sm p-0 text-fg',
          'backdrop:bg-bg/80',
          side === 'right' && 'inset-y-0 right-0 left-auto',
          side === 'left' && 'inset-y-0 left-0 right-auto',
        )}
      >
        <div
          ref={ref}
          className={cn(
            'flex h-full flex-col gap-4 overflow-y-auto border-border bg-surface-raised p-6',
            side === 'right' && 'border-l',
            side === 'left' && 'border-r',
            className,
          )}
          {...props}
        >
          {children}
        </div>
      </dialog>
    )
  },
)
SheetContent.displayName = 'SheetContent'

export function SheetHeader({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex flex-col gap-1', className)} {...props} />
}

export function SheetFooter({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'mt-auto flex items-center justify-end gap-2 pt-2',
        className,
      )}
      {...props}
    />
  )
}

export const SheetTitle = React.forwardRef<
  HTMLHeadingElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h2
    ref={ref}
    className={cn('font-display text-lg font-semibold text-fg', className)}
    {...props}
  />
))
SheetTitle.displayName = 'SheetTitle'

export const SheetDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p ref={ref} className={cn('text-sm text-fg-muted', className)} {...props} />
))
SheetDescription.displayName = 'SheetDescription'
