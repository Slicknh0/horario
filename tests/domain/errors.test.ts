import { describe, expect, test } from 'vitest'
import { messageFor, messageForSignInError } from '@/lib/errors'

describe('messageForSignInError', () => {
  // better-auth answers an unknown e-mail and a wrong password with the same
  // HTTP 401 and the same code, verified against the running server — so
  // naming that one case is what keeps the form from revealing accounts.
  test('the credentials code reads as a wrong e-mail or password', () => {
    expect(messageForSignInError({ code: 'INVALID_EMAIL_OR_PASSWORD' })).toBe(
      messageFor('INVALID_CREDENTIALS'),
    )
  })

  // A rejected origin is how this was found: the demo login ran from a LAN
  // address the server was not configured for, and the customer was told
  // their correct password was wrong.
  test.each(['INVALID_ORIGIN', 'TOO_MANY_REQUESTS', 'INTERNAL_SERVER_ERROR'])(
    '%s is not reported as a wrong password',
    (code) => {
      expect(messageForSignInError({ code })).toBe(
        messageFor('UNEXPECTED_ERROR'),
      )
    },
  )

  test('an error with no code, or no error object, is not blamed on the password', () => {
    expect(messageForSignInError({})).toBe(messageFor('UNEXPECTED_ERROR'))
    expect(messageForSignInError(undefined)).toBe(
      messageFor('UNEXPECTED_ERROR'),
    )
  })
})

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
