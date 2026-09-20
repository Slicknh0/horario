import { describe, expect, test } from 'vitest'
import { validateBookingWindow } from '@/domain/booking-window'
import { canCancel } from '@/domain/cancellation'
import { canActivateService } from '@/domain/plan'

const SP = 'America/Sao_Paulo'
const NOW = new Date('2026-03-10T12:00:00.000Z')

describe('validateBookingWindow', () => {
  const base = {
    now: NOW,
    timezone: SP,
    minNoticeMinutes: 120,
    maxAdvanceDays: 60,
  }

  test('accepts a slot exactly at the notice boundary', () => {
    const r = validateBookingWindow({
      ...base,
      startsAt: new Date('2026-03-10T14:00:00.000Z'),
    })
    expect(r.ok).toBe(true)
  })

  test('rejects a slot inside the notice window', () => {
    const r = validateBookingWindow({
      ...base,
      startsAt: new Date('2026-03-10T13:00:00.000Z'),
    })
    expect(r).toEqual({ ok: false, error: 'TOO_SOON' })
  })

  test('rejects a slot beyond the advance horizon', () => {
    const r = validateBookingWindow({
      ...base,
      startsAt: new Date('2026-06-10T14:00:00.000Z'),
    })
    expect(r).toEqual({ ok: false, error: 'TOO_FAR' })
  })
})

describe('canActivateService', () => {
  test('free allows the third active service', () => {
    expect(canActivateService('free', 2).ok).toBe(true)
  })

  test('free rejects the fourth active service', () => {
    expect(canActivateService('free', 3)).toEqual({
      ok: false,
      error: 'PLAN_LIMIT',
    })
  })

  test('deactivating frees a slot on free', () => {
    expect(canActivateService('free', 3)).toEqual({
      ok: false,
      error: 'PLAN_LIMIT',
    })
    expect(canActivateService('free', 2).ok).toBe(true)
  })

  test('pro is unlimited', () => {
    expect(canActivateService('pro', 999).ok).toBe(true)
  })
})

describe('canCancel', () => {
  const base = { now: NOW, minNoticeMinutes: 120 } as const

  test('allows cancelling outside the notice window', () => {
    const r = canCancel({
      ...base,
      status: 'confirmed',
      startsAt: new Date('2026-03-10T18:00:00.000Z'),
    })
    expect(r.ok).toBe(true)
  })

  test('rejects cancelling inside the notice window', () => {
    const r = canCancel({
      ...base,
      status: 'confirmed',
      startsAt: new Date('2026-03-10T13:00:00.000Z'),
    })
    expect(r).toEqual({ ok: false, error: 'TOO_LATE_TO_CANCEL' })
  })

  test('rejects an already cancelled appointment', () => {
    const r = canCancel({
      ...base,
      status: 'cancelled',
      startsAt: new Date('2026-03-10T18:00:00.000Z'),
    })
    expect(r).toEqual({ ok: false, error: 'ALREADY_CANCELLED' })
  })

  test('rejects a completed appointment as already cancelled-or-closed', () => {
    const r = canCancel({
      ...base,
      status: 'completed',
      startsAt: new Date('2026-03-09T18:00:00.000Z'),
    })
    expect(r).toEqual({ ok: false, error: 'ALREADY_CANCELLED' })
  })
})
