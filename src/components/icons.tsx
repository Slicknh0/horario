import type { SVGProps } from 'react'

// A small hand-authored icon set, one consistent stroke (1.5) and weight
// across the set, rather than pulling in a general-purpose icon library for
// six glyphs.
function BaseIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    />
  )
}

export function CalendarIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <BaseIcon {...props}>
      <rect x="3" y="4" width="14" height="13" rx="2" />
      <path d="M3 8h14M6.5 2.5v3M13.5 2.5v3" />
    </BaseIcon>
  )
}

export function ScissorsIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <BaseIcon {...props}>
      <circle cx="5.5" cy="5.5" r="2" />
      <circle cx="5.5" cy="14.5" r="2" />
      <path d="M7.2 6.8 17 15.5M17 4.5 7.2 13.2" />
    </BaseIcon>
  )
}

export function ClockIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <BaseIcon {...props}>
      <circle cx="10" cy="10" r="7" />
      <path d="M10 6v4l3 2" />
    </BaseIcon>
  )
}

export function SettingsIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <BaseIcon {...props}>
      <path d="M3 6h8M14.5 6h2.5M3 10h2.5M8 10h9M3 14h8M14.5 14h2.5" />
      <circle cx="11" cy="6" r="1.75" fill="currentColor" stroke="none" />
      <circle cx="5.5" cy="10" r="1.75" fill="currentColor" stroke="none" />
      <circle cx="11" cy="14" r="1.75" fill="currentColor" stroke="none" />
    </BaseIcon>
  )
}

export function CopyIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <BaseIcon {...props}>
      <rect x="7" y="7" width="9" height="10" rx="1.5" />
      <path d="M13 7V5.5A1.5 1.5 0 0 0 11.5 4h-7A1.5 1.5 0 0 0 3 5.5v7A1.5 1.5 0 0 0 4.5 14H6" />
    </BaseIcon>
  )
}

export function CheckIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <BaseIcon {...props}>
      <path d="M4 10.5 8 14.5 16 5.5" />
    </BaseIcon>
  )
}

export function PlusIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <BaseIcon {...props}>
      <path d="M10 4v12M4 10h12" />
    </BaseIcon>
  )
}

export function TrashIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <BaseIcon {...props}>
      <path d="M4 6h12M8 6V4.5A1.5 1.5 0 0 1 9.5 3h1A1.5 1.5 0 0 1 12 4.5V6M6 6l.6 9.5A1.5 1.5 0 0 0 8.1 17h3.8a1.5 1.5 0 0 0 1.5-1.5L14 6" />
    </BaseIcon>
  )
}

export function PhoneIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <BaseIcon {...props}>
      <path d="M5.5 3.5h2.3l1 3.3-1.7 1.4a9 9 0 0 0 4.7 4.7l1.4-1.7 3.3 1v2.3c0 1-.8 1.7-1.7 1.6A13.5 13.5 0 0 1 3.9 5.2c-.1-.9.6-1.7 1.6-1.7Z" />
    </BaseIcon>
  )
}

export function CloseIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <BaseIcon {...props}>
      <path d="M5 5l10 10M15 5 5 15" />
    </BaseIcon>
  )
}

export function ChevronLeftIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <BaseIcon {...props}>
      <path d="M12.5 4.5 7 10l5.5 5.5" />
    </BaseIcon>
  )
}

export function ChevronRightIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <BaseIcon {...props}>
      <path d="M7.5 4.5 13 10l-5.5 5.5" />
    </BaseIcon>
  )
}
