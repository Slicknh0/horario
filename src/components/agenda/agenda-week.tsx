'use client'

import { useMemo, useState } from 'react'
import { AppointmentSheet } from '@/components/agenda/appointment-sheet'
import { CopyLinkButton } from '@/components/copy-link-button'
import {
  AGENDA_STATUS_LABEL,
  type AgendaAppointment,
  agendaHourBounds,
  layoutDaySegments,
} from '@/domain/agenda'
import type { TimeRange } from '@/domain/types'
import { cn } from '@/lib/utils'

// Reduced density relative to the day view (2px/min there): seven columns
// share the width a single day had, so each minute buys less pixel space
// on purpose — this view answers "what does the week look like", not
// "exactly what happens at 14:37".
const PX_PER_MINUTE = 1
const MIN_BLOCK_HEIGHT = 16
const HOUR_COLUMN_WIDTH = 44

const STATUS_BLOCK_STYLE: Record<AgendaAppointment['status'], string> = {
  confirmed: 'border-border bg-surface-raised text-fg',
  completed: 'border-border bg-surface-raised text-fg-muted',
  cancelled:
    'border-border border-dashed bg-surface text-fg-muted opacity-70 line-through',
  no_show: 'border-danger bg-surface-raised text-fg',
}

function hourLabel(minute: number): string {
  const h = Math.floor(minute / 60) % 24
  const m = minute % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

export type AgendaWeekDay = {
  dayStart: Date
  dayEnd: Date
  weeklyHours: TimeRange[]
  isToday: boolean
}

export function AgendaWeek({
  timezone,
  days,
  appointments,
  publicUrl,
}: {
  timezone: string
  days: AgendaWeekDay[]
  appointments: AgendaAppointment[]
  publicUrl: string
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selected = appointments.find((a) => a.id === selectedId) ?? null

  const timeFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat('pt-BR', {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: timezone,
      }),
    [timezone],
  )
  const columnHeaderFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat('pt-BR', {
        weekday: 'short',
        day: 'numeric',
        timeZone: timezone,
      }),
    [timezone],
  )

  const byDay = useMemo(
    () =>
      days.map((day) =>
        appointments.filter(
          (a) => a.startsAt < day.dayEnd && a.blockedUntil > day.dayStart,
        ),
      ),
    [days, appointments],
  )

  const layouts = useMemo(
    () =>
      days.map((day, i) =>
        layoutDaySegments(byDay[i] ?? [], day.dayStart, day.dayEnd),
      ),
    [days, byDay],
  )

  function closeSheet(open: boolean) {
    if (!open) setSelectedId(null)
  }

  if (appointments.length === 0) {
    return (
      <div className="flex flex-col items-start gap-4 rounded-lg border border-border bg-surface p-6">
        <p className="text-sm text-fg-muted">
          Nenhum agendamento nesta semana.
        </p>
        <div className="flex items-center gap-2 rounded-md border border-border bg-surface-raised px-3 py-2">
          <span className="truncate text-sm text-fg">
            {publicUrl.replace(/^https?:\/\//, '')}
          </span>
          <CopyLinkButton url={publicUrl} />
        </div>
      </div>
    )
  }

  const fallback = (() => {
    let min = Number.POSITIVE_INFINITY
    let max = Number.NEGATIVE_INFINITY
    for (const layout of layouts) {
      for (const entry of layout.values()) {
        min = Math.min(min, entry.startMinute)
        max = Math.max(
          max,
          entry.startMinute + entry.serviceMinutes + entry.bufferMinutes,
        )
      }
    }
    if (!Number.isFinite(min)) return null
    return {
      startMinute: Math.max(0, Math.floor(min / 60) * 60),
      endMinute: Math.min(24 * 60, Math.ceil(max / 60) * 60),
    }
  })()

  const allWeeklyHours = days.flatMap((day) => day.weeklyHours)
  const bounds = agendaHourBounds(allWeeklyHours, fallback) ?? {
    startMinute: 0,
    endMinute: 24 * 60,
  }
  const hours: number[] = []
  for (let m = bounds.startMinute; m < bounds.endMinute; m += 60) {
    hours.push(m)
  }
  const gridHeight = (bounds.endMinute - bounds.startMinute) * PX_PER_MINUTE

  return (
    <>
      <div className="overflow-x-auto rounded-lg border border-border bg-surface">
        <div className="flex" style={{ minWidth: 640 }}>
          <div
            className="shrink-0 border-r border-border"
            style={{ width: HOUR_COLUMN_WIDTH }}
          >
            <div className="h-9 border-b border-border" />
            <div className="relative" style={{ height: gridHeight }}>
              {hours.map((minute) => (
                <span
                  key={minute}
                  className="tnum absolute right-1.5 -translate-y-1/2 text-[10px] text-fg-muted"
                  style={{
                    top: (minute - bounds.startMinute) * PX_PER_MINUTE,
                  }}
                >
                  {hourLabel(minute)}
                </span>
              ))}
            </div>
          </div>

          {days.map((day, i) => (
            <div
              key={day.dayStart.toISOString()}
              className="min-w-0 flex-1 border-r border-border last:border-r-0"
            >
              <div
                className={cn(
                  'flex h-9 items-center justify-center border-b border-border text-xs font-medium capitalize',
                  day.isToday ? 'text-fg' : 'text-fg-muted',
                )}
              >
                <span
                  className={cn(
                    day.isToday ? 'border-b-2 border-fg pb-0.5' : undefined,
                  )}
                >
                  {columnHeaderFormatter.format(day.dayStart)}
                </span>
              </div>

              <div className="relative" style={{ height: gridHeight }}>
                {hours.map((minute) => (
                  <div
                    key={minute}
                    aria-hidden="true"
                    className="absolute inset-x-0 border-t border-border/50"
                    style={{
                      top: (minute - bounds.startMinute) * PX_PER_MINUTE,
                    }}
                  />
                ))}

                {(byDay[i] ?? []).map((appointment) => {
                  const entry = layouts[i]?.get(appointment.id)
                  if (!entry) return null

                  const top =
                    (entry.startMinute - bounds.startMinute) * PX_PER_MINUTE
                  const serviceHeight = Math.max(
                    entry.serviceMinutes * PX_PER_MINUTE,
                    MIN_BLOCK_HEIGHT,
                  )
                  const bufferHeight = entry.bufferMinutes * PX_PER_MINUTE
                  const widthPct = 100 / entry.laneCount
                  const leftPct = entry.laneIndex * widthPct

                  return (
                    <div
                      key={appointment.id}
                      className="absolute px-0.5"
                      style={{
                        top,
                        left: `${leftPct}%`,
                        width: `${widthPct}%`,
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => setSelectedId(appointment.id)}
                        aria-label={`${appointment.customerName}, ${timeFormatter.format(appointment.startsAt)}, ${appointment.serviceName}, ${AGENDA_STATUS_LABEL[appointment.status]}`}
                        className={cn(
                          'flex w-full flex-col overflow-hidden rounded-sm border px-1 py-0.5 text-left text-[10px] leading-tight transition-colors',
                          'hover:brightness-110',
                          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-surface',
                          STATUS_BLOCK_STYLE[appointment.status],
                        )}
                        style={{ height: serviceHeight }}
                      >
                        <span className="truncate font-medium">
                          {appointment.customerName}
                        </span>
                      </button>
                      {bufferHeight > 0 ? (
                        <div
                          aria-hidden="true"
                          className="rounded-b-sm border border-t-0 border-border/50 opacity-50"
                          style={{
                            height: bufferHeight,
                            backgroundImage:
                              'repeating-linear-gradient(45deg, var(--color-border) 0 3px, transparent 3px 8px)',
                          }}
                        />
                      ) : null}
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      <AppointmentSheet
        appointment={selected}
        timezone={timezone}
        onOpenChange={closeSheet}
      />
    </>
  )
}
