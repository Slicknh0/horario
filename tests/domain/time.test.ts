// tests/domain/time.test.ts
import { describe, expect, test } from 'vitest'
import {
  addDays,
  localDate,
  localDateOf,
  toInstant,
  weekdayOf,
} from '@/domain/time'

const SP = 'America/Sao_Paulo'

describe('toInstant', () => {
  test('converts a local minute to the matching UTC instant', () => {
    // 2026-03-10 09:00 in São Paulo (UTC-3) is 12:00 UTC
    const instant = toInstant(localDate('2026-03-10'), 540, SP)
    expect(instant?.toISOString()).toBe('2026-03-10T12:00:00.000Z')
  })

  test('handles a timezone with a DST gap by returning null for a nonexistent time', () => {
    // 2026-03-29 01:30 does not exist in Europe/Lisbon (clocks jump 01:00 -> 02:00)
    expect(toInstant(localDate('2026-03-29'), 90, 'Europe/Lisbon')).toBeNull()
  })

  test('throws on out-of-range minute', () => {
    expect(() => toInstant(localDate('2026-03-10'), 1440, SP)).toThrow(
      'Invalid minute: 1440',
    )
    expect(() => toInstant(localDate('2026-03-10'), -30, SP)).toThrow(
      'Invalid minute: -30',
    )
  })

  test('resolves ambiguous times (DST backward overlap) to the occurrence after transition', () => {
    // 2026-10-25 01:30 occurs twice in Europe/Lisbon (clocks fall back 02:00 -> 01:00).
    // The ambiguous time resolves to the post-transition occurrence (UTC+0).
    const instant = toInstant(localDate('2026-10-25'), 90, 'Europe/Lisbon')
    expect(instant?.toISOString()).toBe('2026-10-25T01:30:00.000Z')
  })
})

describe('localDateOf', () => {
  test('uses the tenant timezone, not the server timezone', () => {
    // 2026-03-11T02:00Z is still 2026-03-10 at 23:00 in São Paulo
    expect(localDateOf(new Date('2026-03-11T02:00:00.000Z'), SP)).toBe(
      '2026-03-10',
    )
  })
})

describe('addDays and weekdayOf', () => {
  test('addDays crosses month boundaries', () => {
    expect(addDays(localDate('2026-01-31'), 1)).toBe('2026-02-01')
  })

  test('weekdayOf returns 0 for Sunday', () => {
    expect(weekdayOf(localDate('2026-03-08'), SP)).toBe(0)
  })
})
