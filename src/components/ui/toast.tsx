'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

export interface ToastRecord {
  id: string
  title: string
  description?: string
  variant?: 'default' | 'danger'
}

type ToastInput = Omit<ToastRecord, 'id'>

interface ToastContextValue {
  toasts: ToastRecord[]
  toast: (input: ToastInput) => string
  dismiss: (id: string) => void
}

const ToastContext = React.createContext<ToastContextValue | null>(null)

const AUTO_DISMISS_MS = 5000

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<ToastRecord[]>([])

  const dismiss = React.useCallback((id: string) => {
    setToasts((current) => current.filter((t) => t.id !== id))
  }, [])

  const toast = React.useCallback(
    (input: ToastInput) => {
      const id = crypto.randomUUID()
      setToasts((current) => [...current, { id, ...input }])
      setTimeout(() => dismiss(id), AUTO_DISMISS_MS)
      return id
    },
    [dismiss],
  )

  const value = React.useMemo(
    () => ({ toasts, toast, dismiss }),
    [toasts, toast, dismiss],
  )

  return <ToastContext.Provider value={value}>{children}</ToastContext.Provider>
}

export function useToast(): ToastContextValue {
  const ctx = React.useContext(ToastContext)
  if (!ctx) {
    throw new Error('useToast must be used within a <ToastProvider>')
  }
  return ctx
}

export function Toast({
  toast: record,
  onDismiss,
}: {
  toast: ToastRecord
  onDismiss: (id: string) => void
}) {
  return (
    <div
      role="status"
      className={cn(
        'flex w-full max-w-sm items-start gap-3 rounded-lg border p-4 shadow-lg',
        record.variant === 'danger'
          ? 'border-danger/40 bg-surface-raised text-fg'
          : 'border-border bg-surface-raised text-fg',
      )}
    >
      <div className="flex-1">
        <p className="text-sm font-medium text-fg">{record.title}</p>
        {record.description ? (
          <p className="mt-1 text-sm text-fg-muted">{record.description}</p>
        ) : null}
      </div>
      <button
        type="button"
        onClick={() => onDismiss(record.id)}
        aria-label="Dispensar notificação"
        className={cn(
          'shrink-0 rounded-md p-1 text-fg-muted transition-colors hover:bg-surface hover:text-fg',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface-raised',
        )}
      >
        <svg aria-hidden="true" viewBox="0 0 16 16" className="size-4">
          <path
            d="M4 4l8 8M12 4l-8 8"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      </button>
    </div>
  )
}
