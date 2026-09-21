import { describe, expect, test } from 'vitest'
import { validateRanges } from '@/domain/availability-input'

describe('validateRanges', () => {
  test('accepts a morning and an afternoon window', () => {
    expect(
      validateRanges([
        { startMinute: 540, endMinute: 720 },
        { startMinute: 780, endMinute: 1080 },
      ]).ok,
    ).toBe(true)
  })

  test('rejects an end before the start', () => {
    expect(validateRanges([{ startMinute: 720, endMinute: 540 }])).toEqual({
      ok: false,
      error: 'RANGE_INVALID',
    })
  })

  test('rejects windows that overlap each other', () => {
    expect(
      validateRanges([
        { startMinute: 540, endMinute: 780 },
        { startMinute: 700, endMinute: 1080 },
      ]),
    ).toEqual({ ok: false, error: 'RANGE_OVERLAP' })
  })

  test('rejects a minute outside 0..1440', () => {
    expect(validateRanges([{ startMinute: -10, endMinute: 600 }])).toEqual({
      ok: false,
      error: 'RANGE_INVALID',
    })
  })
})
