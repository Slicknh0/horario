import { addDays, localDateOf, toInstant } from './time'
import {
  type DayException,
  GRANULARITY_MINUTES,
  type Interval,
  type LocalDate,
  type Slot,
  type TimeRange,
} from './types'

export type SlotInput = {
  date: LocalDate
  timezone: string
  weeklyHours: TimeRange[]
  exception: DayException | null
  service: { durationMinutes: number; bufferMinutes: number }
  busy: Interval[]
  now: Date
  minNoticeMinutes: number
  maxAdvanceDays: number
}

function windowsFor(input: SlotInput): TimeRange[] {
  const { exception, weeklyHours } = input
  if (!exception) return weeklyHours
  if (exception.isClosed) return []
  if (exception.startMinute === null || exception.endMinute === null) return []
  return [
    { startMinute: exception.startMinute, endMinute: exception.endMinute },
  ]
}

function overlaps(a: Interval, b: Interval): boolean {
  return a.start < b.end && b.start < a.end
}

export function generateSlots(input: SlotInput): Slot[] {
  const {
    date,
    timezone,
    service,
    busy,
    now,
    minNoticeMinutes,
    maxAdvanceDays,
  } = input

  const horizon = addDays(localDateOf(now, timezone), maxAdvanceDays)
  if (date > horizon) return []

  const earliest = new Date(now.getTime() + minNoticeMinutes * 60_000)
  const slots: Slot[] = []

  for (const window of windowsFor(input)) {
    for (
      let minute = window.startMinute;
      minute + service.durationMinutes <= window.endMinute;
      minute += GRANULARITY_MINUTES
    ) {
      const startsAt = toInstant(date, minute, timezone)
      if (!startsAt) continue // nonexistent wall-clock time (DST gap)
      if (startsAt < earliest) continue

      const endsAt = new Date(
        startsAt.getTime() + service.durationMinutes * 60_000,
      )
      const blocked: Interval = {
        start: startsAt,
        end: new Date(endsAt.getTime() + service.bufferMinutes * 60_000),
      }
      if (busy.some((b) => overlaps(blocked, b))) continue

      slots.push({ startsAt, endsAt })
    }
  }

  return slots.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())
}
