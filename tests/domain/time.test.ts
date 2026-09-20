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
