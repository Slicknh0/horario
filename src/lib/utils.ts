import { type ClassValue, clsx } from 'clsx'
import type { MouseEvent } from 'react'
import { twMerge } from 'tailwind-merge'

// Every UI primitive funnels its class list through this so a caller's
// `className` prop can override a primitive's own classes instead of
// fighting them (clsx joins, twMerge resolves the Tailwind conflicts).
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Mirrors next/link's own `isModifiedEvent` check (node_modules/next/dist/
// client/app-dir/link.js) — the exact conditions under which Link itself
// lets the browser handle a click natively (open in a new tab, download,
// etc.) instead of performing its own client-side navigation. Anything
// that wants to intercept a real `<a href>`'s click to drive its own
// navigation (e.g. `startTransition(() => router.push(href))`, to get a
// shared `isPending` a sibling component can read) must skip exactly
// these same cases before calling `preventDefault()`, or middle-click,
// ctrl/cmd-click, and `target="_blank"`/`download` links silently break.
export function isPlainLeftClick(
  event: MouseEvent<HTMLAnchorElement>,
): boolean {
  const target = event.currentTarget.getAttribute('target')
  if (target && target !== '_self') return false
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
    return false
  if (event.button !== 0) return false
  if (event.currentTarget.hasAttribute('download')) return false
  return true
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
