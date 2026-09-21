import { describe, expect, test } from 'vitest'
import { normalizeSlug, validateSlug } from '@/domain/slug'

describe('normalizeSlug', () => {
  test('lowercases, strips accents and joins words with hyphens', () => {
    expect(normalizeSlug('Barbearia do Zé')).toBe('barbearia-do-ze')
  })

  test('collapses repeated separators and trims them', () => {
    expect(normalizeSlug('  --Salão   Top!!  ')).toBe('salao-top')
  })
})

describe('validateSlug', () => {
  test.each(['app', 'api', 'login', 'cadastro', 'b', 'a', '_next'])(
    'rejects the reserved slug %s',
    (slug) => {
      expect(validateSlug(slug)).toEqual({ ok: false, error: 'SLUG_RESERVED' })
    },
  )

  test('rejects a slug shorter than 3 characters', () => {
    expect(validateSlug('ze')).toEqual({ ok: false, error: 'SLUG_INVALID' })
  })

  test('accepts a normal slug', () => {
    expect(validateSlug('barbearia-do-ze').ok).toBe(true)
  })
})
