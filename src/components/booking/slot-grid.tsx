'use client'

import * as RadioGroupPrimitive from '@radix-ui/react-radio-group'
import type { Slot } from '@/domain/types'
import { cn } from '@/lib/utils'

// Built on Radix rather than hand-rolled arrow-key/aria-checked logic — see
// src/components/ui/switch.tsx for the same rationale in this project.
const MANHA_END_MINUTE = 12 * 60
const TARDE_END_MINUTE = 18 * 60

function minuteOfDay(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: 'numeric',
    minute: 'numeric',
    hourCycle: 'h23',
  }).formatToParts(date)
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? 0)
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? 0)
  return hour * 60 + minute
}

// One radiogroup spans every time-of-day section so arrow keys move through
// the whole day, not just within Manhã/Tarde/Noite individually — Radix's
// Root supplies role="radiogroup" itself, this component never redeclares it.
export function SlotGrid({
  slots,
  timezone,
  value,
  onValueChange,
}: {
  slots: Slot[]
  timezone: string
  value: string | undefined
  onValueChange: (iso: string) => void
}) {
  const timeFormatter = new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: timezone,
  })

  const manha: Slot[] = []
  const tarde: Slot[] = []
  const noite: Slot[] = []
  for (const slot of slots) {
    const minute = minuteOfDay(slot.startsAt, timezone)
    if (minute < MANHA_END_MINUTE) manha.push(slot)
    else if (minute < TARDE_END_MINUTE) tarde.push(slot)
    else noite.push(slot)
  }

  const groups = [
    { label: 'Manhã', items: manha },
    { label: 'Tarde', items: tarde },
    { label: 'Noite', items: noite },
  ].filter((group) => group.items.length > 0)

  return (
    <RadioGroupPrimitive.Root
      aria-label="Horários disponíveis"
      value={value}
      onValueChange={onValueChange}
      className="flex flex-col gap-5"
    >
      {groups.map((group) => (
        <div key={group.label} className="flex flex-col gap-2">
          <h3 className="text-sm font-medium text-fg-muted">{group.label}</h3>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {group.items.map((slot) => {
              const iso = slot.startsAt.toISOString()
              return (
                <RadioGroupPrimitive.Item
                  key={iso}
                  value={iso}
                  className={cn(
                    'tnum flex h-11 items-center justify-center rounded-md border border-border bg-surface text-sm font-medium text-fg transition-colors',
                    'hover:bg-surface-raised',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
                    'data-[state=checked]:border-accent data-[state=checked]:bg-accent data-[state=checked]:text-accent-fg',
                  )}
                >
                  {timeFormatter.format(slot.startsAt)}
                </RadioGroupPrimitive.Item>
              )
            })}
          </div>
        </div>
      ))}
    </RadioGroupPrimitive.Root>
  )
}
