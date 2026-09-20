export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E }

export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value })
export const err = <E>(error: E): Result<never, E> => ({ ok: false, error })

export type DomainError =
  | 'SLOT_TAKEN'
  | 'TOO_SOON'
  | 'TOO_FAR'
  | 'OUTSIDE_HOURS'
  | 'PLAN_LIMIT'
  | 'TOO_LATE_TO_CANCEL'
  | 'ALREADY_CANCELLED'

export type LocalDate = string & { readonly __brand: 'LocalDate' }

export type TimeRange = { startMinute: number; endMinute: number }
export type Interval = { start: Date; end: Date }
export type Slot = { startsAt: Date; endsAt: Date }
export type DayException = {
  isClosed: boolean
  startMinute: number | null
  endMinute: number | null
}
export type Plan = 'free' | 'pro'
export type AppointmentStatus =
  | 'confirmed'
  | 'completed'
  | 'cancelled'
  | 'no_show'

export const GRANULARITY_MINUTES = 15
