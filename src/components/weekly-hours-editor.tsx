'use client'

import { useAction } from 'next-safe-action/hooks'
import { useId, useState } from 'react'
import { saveWeeklyHours } from '@/actions/availability'
import { PlusIcon, TrashIcon } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { TimeRange } from '@/domain/types'
import { messageFor, type UiError } from '@/lib/errors'

const WEEKDAY_LABELS: Record<number, string> = {
  1: 'Segunda-feira',
  2: 'Terça-feira',
  3: 'Quarta-feira',
  4: 'Quinta-feira',
  5: 'Sexta-feira',
  6: 'Sábado',
  0: 'Domingo',
}

// Monday first, Sunday last — how an owner actually thinks about a business
// week. The weekday number itself still follows the schema/domain
// convention (0 Sunday .. 6 Saturday, matching JS's Date#getDay) end to
// end; only this display order is reshuffled.
const WEEKDAY_DISPLAY_ORDER = [1, 2, 3, 4, 5, 6, 0]

function minutesToClock(minute: number): string {
  const h = Math.floor(minute / 60)
  const m = minute % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function clockToMinutes(clock: string): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(clock)
  if (!match) return null
  const [, hh, mm] = match
  return Number(hh) * 60 + Number(mm)
}

type RangeField = TimeRange & { key: string }

let nextRangeKey = 0
function withKey(range: TimeRange): RangeField {
  nextRangeKey += 1
  return { ...range, key: `r${nextRangeKey}` }
}

// One weekday's row: its own local edit buffer and its own save action, so
// saving Monday never touches what's typed but unsaved on Tuesday.
// `saveWeeklyHours` replaces this weekday's rows wholesale — there is no
// per-interval id to update, so the whole list is resubmitted every time.
function DayRow({
  weekday,
  initialRanges,
}: {
  weekday: number
  initialRanges: TimeRange[]
}) {
  const formId = useId()
  const [ranges, setRanges] = useState<RangeField[]>(() =>
    initialRanges.map(withKey),
  )
  const [savedOnce, setSavedOnce] = useState(false)
  const { execute, result, isExecuting } = useAction(saveWeeklyHours, {
    onSuccess: ({ data }) => {
      if (data.ok) setSavedOnce(true)
    },
  })

  const error: UiError | undefined = result.serverError
    ? 'UNEXPECTED_ERROR'
    : result.data && !result.data.ok
      ? result.data.error
      : undefined

  function updateRange(
    key: string,
    field: 'startMinute' | 'endMinute',
    clock: string,
  ) {
    const minute = clockToMinutes(clock)
    if (minute === null) return
    setSavedOnce(false)
    setRanges((prev) =>
      prev.map((r) => (r.key === key ? { ...r, [field]: minute } : r)),
    )
  }

  function addRange() {
    setSavedOnce(false)
    setRanges((prev) => [
      ...prev,
      withKey({ startMinute: 540, endMinute: 1080 }),
    ])
  }

  function removeRange(key: string) {
    setSavedOnce(false)
    setRanges((prev) => prev.filter((r) => r.key !== key))
  }

  function handleSave() {
    execute({
      weekday,
      ranges: ranges.map(({ startMinute, endMinute }) => ({
        startMinute,
        endMinute,
      })),
    })
  }

  return (
    <div className="flex flex-col gap-2 border-b border-border py-4 last:border-b-0 sm:flex-row sm:items-start sm:gap-4">
      <span className="w-32 shrink-0 pt-2 font-medium text-fg">
        {WEEKDAY_LABELS[weekday]}
      </span>

      <div className="flex flex-1 flex-col gap-2">
        {ranges.length === 0 ? (
          <p className="pt-2 text-sm text-fg-muted">Fechado o dia todo.</p>
        ) : (
          ranges.map((range) => (
            <div key={range.key} className="flex items-center gap-2">
              <Label
                htmlFor={`${formId}-${range.key}-start`}
                className="sr-only"
              >
                Início em {WEEKDAY_LABELS[weekday]}
              </Label>
              <Input
                id={`${formId}-${range.key}-start`}
                type="time"
                className="tnum w-28"
                value={minutesToClock(range.startMinute)}
                onChange={(e) =>
                  updateRange(range.key, 'startMinute', e.target.value)
                }
              />
              <span className="text-sm text-fg-muted">até</span>
              <Label htmlFor={`${formId}-${range.key}-end`} className="sr-only">
                Término em {WEEKDAY_LABELS[weekday]}
              </Label>
              <Input
                id={`${formId}-${range.key}-end`}
                type="time"
                className="tnum w-28"
                value={minutesToClock(range.endMinute)}
                onChange={(e) =>
                  updateRange(range.key, 'endMinute', e.target.value)
                }
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => removeRange(range.key)}
                aria-label={`Remover intervalo de ${WEEKDAY_LABELS[weekday]}`}
              >
                <TrashIcon className="size-4" />
              </Button>
            </div>
          ))
        )}

        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" variant="outline" size="sm" onClick={addRange}>
            <PlusIcon className="size-3.5" />
            Adicionar intervalo
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={isExecuting}
            onClick={handleSave}
          >
            {isExecuting ? 'Salvando…' : 'Salvar'}
          </Button>
          {savedOnce && !isExecuting ? (
            <span className="text-sm text-fg-muted">Salvo.</span>
          ) : null}
        </div>

        {error ? (
          <p role="alert" className="text-sm text-danger">
            {messageFor(error)}
          </p>
        ) : null}
      </div>
    </div>
  )
}

export function WeeklyHoursEditor({
  hoursByWeekday,
}: {
  hoursByWeekday: Record<number, TimeRange[]>
}) {
  return (
    <div className="flex flex-col">
      {WEEKDAY_DISPLAY_ORDER.map((weekday) => (
        <DayRow
          key={weekday}
          weekday={weekday}
          initialRanges={hoursByWeekday[weekday] ?? []}
        />
      ))}
    </div>
  )
}
