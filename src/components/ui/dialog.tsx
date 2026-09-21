'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

// Built on the native <dialog> element rather than a portal-and-overlay
// library: <dialog> renders in the top layer, so it escapes any
// overflow-hidden ancestor for free and gets focus-trapping, Escape-to-close
// and a real ::backdrop from the browser instead of hand-rolled JS.

interface DialogContextValue {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const DialogContext = React.createContext<DialogContextValue | null>(null)

export function useDialogContext(): DialogContextValue {
  const ctx = React.useContext(DialogContext)
  if (!ctx) {
    throw new Error('Dialog parts must be rendered within a <Dialog>')
  }
  return ctx
}

export interface DialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  children: React.ReactNode
}

export function Dialog({ open, onOpenChange, children }: DialogProps) {
  const value = React.useMemo(
    () => ({ open, onOpenChange }),
    [open, onOpenChange],
  )
  return (
    <DialogContext.Provider value={value}>{children}</DialogContext.Provider>
  )
}

// Shared by DialogContent and SheetContent: syncs `open` with the native
// showModal()/close() calls a <dialog> requires (setting the `open`
// attribute directly does not produce a modal with a backdrop), and
// forwards the native `close` event (fired on Escape, or a <form
// method="dialog">) back into onOpenChange.
export function useNativeDialogSync(
  dialogRef: React.RefObject<HTMLDialogElement | null>,
) {
  const { open, onOpenChange } = useDialogContext()

  React.useEffect(() => {
    const node = dialogRef.current
    if (!node) return
    if (open && !node.open) node.showModal()
    if (!open && node.open) node.close()
  }, [open, dialogRef])

  React.useEffect(() => {
    const node = dialogRef.current
    if (!node) return
    const handleClose = () => onOpenChange(false)
    node.addEventListener('close', handleClose)
    return () => node.removeEventListener('close', handleClose)
  }, [onOpenChange, dialogRef])
}

// A default focus ring ships even though this is a bare, unstyled trigger
// (most call sites wrap a Button, which already has one) so a plain
// `<DialogTrigger>text</DialogTrigger>` is never keyboard-invisible.
const TRIGGER_FOCUS_CLASSES =
  'rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg'

export const DialogTrigger = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement>
>(({ onClick, type = 'button', className, ...props }, ref) => {
  const { onOpenChange } = useDialogContext()
  return (
    <button
      ref={ref}
      type={type}
      className={cn(TRIGGER_FOCUS_CLASSES, className)}
      onClick={(event) => {
        onClick?.(event)
        onOpenChange(true)
      }}
      {...props}
    />
  )
})
DialogTrigger.displayName = 'DialogTrigger'

export const DialogClose = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement>
>(({ onClick, type = 'button', className, ...props }, ref) => {
  const { onOpenChange } = useDialogContext()
  return (
    <button
      ref={ref}
      type={type}
      className={cn(TRIGGER_FOCUS_CLASSES, className)}
      onClick={(event) => {
        onClick?.(event)
        onOpenChange(false)
      }}
      {...props}
    />
  )
})
DialogClose.displayName = 'DialogClose'

export const DialogContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, children, ...props }, ref) => {
  const dialogRef = React.useRef<HTMLDialogElement>(null)
  useNativeDialogSync(dialogRef)

  return (
    <dialog
      ref={dialogRef}
      className={cn(
        'w-[calc(100%-2rem)] max-w-md rounded-lg border border-border bg-surface-raised p-0 text-fg',
        'backdrop:bg-bg/80',
        className,
      )}
    >
      <div ref={ref} className="flex flex-col gap-4 p-6" {...props}>
        {children}
      </div>
    </dialog>
  )
})
DialogContent.displayName = 'DialogContent'

export function DialogHeader({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex flex-col gap-1', className)} {...props} />
}

export function DialogFooter({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('flex items-center justify-end gap-2 pt-2', className)}
      {...props}
    />
  )
}

export const DialogTitle = React.forwardRef<
  HTMLHeadingElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h2
    ref={ref}
    className={cn('font-display text-lg font-semibold text-fg', className)}
    {...props}
  />
))
DialogTitle.displayName = 'DialogTitle'

export const DialogDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p ref={ref} className={cn('text-sm text-fg-muted', className)} {...props} />
))
DialogDescription.displayName = 'DialogDescription'
