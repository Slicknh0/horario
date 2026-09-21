import { err, ok, type Result } from './types'

const RESERVED = new Set([
  'app',
  'api',
  'login',
  'cadastro',
  'b',
  'a',
  '_next',
  'admin',
  'sobre',
])

export function normalizeSlug(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function validateSlug(
  slug: string,
): Result<void, 'SLUG_RESERVED' | 'SLUG_INVALID'> {
  if (RESERVED.has(slug)) return err('SLUG_RESERVED')
  if (!/^[a-z0-9][a-z0-9-]{2,49}$/.test(slug)) return err('SLUG_INVALID')
  return ok(undefined)
}
