import { describe, expect, test } from 'vitest'
import { messageFor } from '@/lib/errors'

describe('messageFor', () => {
  test('every domain error has a pt-BR message', () => {
    const codes = [
      'SLOT_TAKEN',
      'TOO_SOON',
      'TOO_FAR',
      'OUTSIDE_HOURS',
      'PLAN_LIMIT',
      'TOO_LATE_TO_CANCEL',
      'ALREADY_CANCELLED',
      'SLUG_TAKEN',
      'SLUG_RESERVED',
      'SLUG_INVALID',
      'NOT_FOUND',
    ] as const
    for (const code of codes) {
      expect(messageFor(code).length).toBeGreaterThan(0)
    }
  })

  test('SLOT_TAKEN tells the customer to pick another time', () => {
    expect(messageFor('SLOT_TAKEN')).toMatch(/horário/i)
  })
})
