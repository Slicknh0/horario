import { type AppointmentStatus, err, ok, type Result } from './types'

export function canCancel(input: {
  status: AppointmentStatus
  startsAt: Date
  now: Date
  minNoticeMinutes: number
}): Result<void, 'TOO_LATE_TO_CANCEL' | 'ALREADY_CANCELLED'> {
  if (input.status !== 'confirmed') return err('ALREADY_CANCELLED')

  const deadline = new Date(
    input.startsAt.getTime() - input.minNoticeMinutes * 60_000,
  )
  if (input.now > deadline) return err('TOO_LATE_TO_CANCEL')

  return ok(undefined)
}
