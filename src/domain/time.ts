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
