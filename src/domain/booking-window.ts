import { addDays, localDateOf } from './time'
import { err, ok, type Result } from './types'

export function validateBookingWindow(input: {
  startsAt: Date
  now: Date
  timezone: string
  minNoticeMinutes: number
  maxAdvanceDays: number
}): Result<void, 'TOO_SOON' | 'TOO_FAR'> {
  const earliest = new Date(
    input.now.getTime() + input.minNoticeMinutes * 60_000,
  )
  if (input.startsAt < earliest) return err('TOO_SOON')

  const horizon = addDays(
    localDateOf(input.now, input.timezone),
    input.maxAdvanceDays,
  )
  if (localDateOf(input.startsAt, input.timezone) > horizon)
    return err('TOO_FAR')

  return ok(undefined)
}
