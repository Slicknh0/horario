import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

// Every UI primitive funnels its class list through this so a caller's
// `className` prop can override a primitive's own classes instead of
// fighting them (clsx joins, twMerge resolves the Tailwind conflicts).
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Next's searchParams gives `string | string[] | undefined` for any key,
// since a repeated query key legitimately becomes an array — every page
// that reads a single-value param (?token=, ?servico=, ?data=) needs this
// same narrowing, so it lives here instead of once per page.
export function firstParam(
  value: string | string[] | undefined,
): string | undefined {
  return Array.isArray(value) ? value[0] : value
}
