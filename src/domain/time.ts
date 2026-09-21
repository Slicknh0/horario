import { TZDate } from '@date-fns/tz'
import type { LocalDate } from './types'

export function localDate(value: string): LocalDate {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`Invalid LocalDate: ${value}`)
  }
  return value as LocalDate
}

function parts(date: LocalDate): [number, number, number] {
  const [y, m, d] = date.split('-').map(Number)
  // These assertions are safe: every caller passes through the regex-validated localDate() brand.
  return [y as number, m as number, d as number]
}

/**
 * Converts a wall-clock minute on a local date into a UTC instant.
 * Returns null when that wall-clock time does not exist (DST forward gap).
 * Ambiguous times (DST backward overlap) resolve to the occurrence after the transition.
 */
export function toInstant(
  date: LocalDate,
  minute: number,
  timeZone: string,
): Date | null {
  if (!Number.isInteger(minute) || minute < 0 || minute >= 1440) {
    throw new Error(`Invalid minute: ${minute}`)
  }
  const [year, month, day] = parts(date)
  const hours = Math.floor(minute / 60)
  const minutes = minute % 60
  const tz = new TZDate(year, month - 1, day, hours, minutes, 0, 0, timeZone)
  // A nonexistent wall-clock time is normalized by the runtime to a different
  // local time; detect it by reading the local fields back.
  if (tz.getHours() !== hours || tz.getMinutes() !== minutes) return null
  return new Date(tz.getTime())
}

export function localDateOf(instant: Date, timeZone: string): LocalDate {
  const tz = new TZDate(instant.getTime(), timeZone)
  const y = String(tz.getFullYear()).padStart(4, '0')
  const m = String(tz.getMonth() + 1).padStart(2, '0')
  const d = String(tz.getDate()).padStart(2, '0')
  return localDate(`${y}-${m}-${d}`)
}

export function addDays(date: LocalDate, days: number): LocalDate {
  const [year, month, day] = parts(date)
  const utc = new Date(Date.UTC(year, month - 1, day))
  utc.setUTCDate(utc.getUTCDate() + days)
  const y = String(utc.getUTCFullYear()).padStart(4, '0')
  const m = String(utc.getUTCMonth() + 1).padStart(2, '0')
  const d = String(utc.getUTCDate()).padStart(2, '0')
  return localDate(`${y}-${m}-${d}`)
}

export function weekdayOf(date: LocalDate, timeZone: string): number {
  const instant = toInstant(date, 12 * 60, timeZone)
  if (!instant) throw new Error(`Cannot resolve weekday for ${date}`)
  return new TZDate(instant.getTime(), timeZone).getDay()
}

// The one formal "weekday, day de month de year às HH:mm" rendering used
// everywhere a customer needs to recognize their own booking outside the
// live slot picker (confirmation e-mail, confirmation screen, the /a/token
// management page) — a single call site so none of them can drift into
// formatting the same instant two different ways, and so `timeZone` is
// never optional to a caller: always the tenant's, never the server's or
// the browser's.
export function formatFullDateTime(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'full',
    timeStyle: 'short',
    timeZone,
  }).format(instant)
}

// The time-only counterpart to formatFullDateTime, for places that already
// show the date separately and only need "HH:mm" — the agenda's day/week
// grids and the appointment sheet. Was three byte-identical
// `new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit',
// timeZone })` instances before this was extracted; `timeZone` is never
// optional here for the same reason it never is on formatFullDateTime —
// always the tenant's, never the server's or the browser's.
export function formatTime(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone,
  }).format(instant)
}
