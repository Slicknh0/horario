import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

// Every UI primitive funnels its class list through this so a caller's
// `className` prop can override a primitive's own classes instead of
// fighting them (clsx joins, twMerge resolves the Tailwind conflicts).
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
