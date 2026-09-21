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

// 2px per minute: a 30-minute cut is a 60px block, tall enough to hold a
// name and a time on two lines; a 90-minute combo is 180px, tall enough
// that the buffer extension below it is visibly a fraction of the whole —
// exactly the "a 75-minute combo really does eat the 10:00 and the 11:00"
// legibility the brief asks for. Density over whitespace: this is read
// standing at a counter, not studied.
const PX_PER_MINUTE = 2
const MIN_BLOCK_HEIGHT = 28
const HOUR_COLUMN_WIDTH = 52

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

export function AgendaDay({
  timezone,
  dayStart,
  dayEnd,
  weeklyHours,
  appointments,
  publicUrl,
}: {
  timezone: string
  dayStart: Date
  dayEnd: Date
  weeklyHours: TimeRange[]
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

  const layout = useMemo(
    () => layoutDaySegments(appointments, dayStart, dayEnd),
    [appointments, dayStart, dayEnd],
  )

  function closeSheet(open: boolean) {
    if (!open) setSelectedId(null)
  }

  if (appointments.length === 0) {
    return (
      <div className="flex flex-col items-start gap-4 rounded-lg border border-border bg-surface p-6">
        <p className="text-sm text-fg-muted">Nenhum agendamento para hoje.</p>
        <div className="flex items-center gap-2">
          <span className="truncate text-sm text-fg-muted">
            Compartilhe o link para receber agendamentos:
          </span>
        </div>
        <div className="flex items-center gap-2 rounded-md border border-border bg-surface-raised px-3 py-2">
          <span className="truncate text-sm text-fg">
            {publicUrl.replace(/^https?:\/\//, '')}
          </span>
          <CopyLinkButton url={publicUrl} />
        </div>
      </div>
    )
  }

  // No weekly_hours row for this weekday at all (closed, or never set up)
  // but appointments still exist here — they can only be bleed-over from a
  // neighboring day (the corrected listAppointmentsBetween predicate this
  // task must not touch). The fallback bound covers just those segments so
  // the grid still renders something instead of collapsing to nothing.
  const fallback = (() => {
    let min = Number.POSITIVE_INFINITY
    let max = Number.NEGATIVE_INFINITY
    for (const layoutEntry of layout.values()) {
      min = Math.min(min, layoutEntry.startMinute)
      max = Math.max(
        max,
        layoutEntry.startMinute +
          layoutEntry.serviceMinutes +
          layoutEntry.bufferMinutes,
      )
    }
    if (!Number.isFinite(min)) return null
    return {
      startMinute: Math.max(0, Math.floor(min / 60) * 60),
      endMinute: Math.min(24 * 60, Math.ceil(max / 60) * 60),
    }
  })()

  const bounds = agendaHourBounds(weeklyHours, fallback) ?? {
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
      <div className="flex overflow-x-auto rounded-lg border border-border bg-surface">
        <div
          className="relative shrink-0 border-r border-border"
          style={{ width: HOUR_COLUMN_WIDTH, height: gridHeight }}
        >
          {hours.map((minute) => (
            <span
              key={minute}
              className="tnum absolute right-2 -translate-y-1/2 text-xs text-fg-muted"
              style={{ top: (minute - bounds.startMinute) * PX_PER_MINUTE }}
            >
              {hourLabel(minute)}
            </span>
          ))}
        </div>

        <div className="relative min-w-0 flex-1" style={{ height: gridHeight }}>
          {hours.map((minute) => (
            <div
              key={minute}
              aria-hidden="true"
              className="absolute inset-x-0 border-t border-border/50"
              style={{ top: (minute - bounds.startMinute) * PX_PER_MINUTE }}
            />
          ))}

          {appointments.map((appointment) => {
            const entry = layout.get(appointment.id)
            if (!entry) return null

            const top = (entry.startMinute - bounds.startMinute) * PX_PER_MINUTE
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
                style={{ top, left: `${leftPct}%`, width: `${widthPct}%` }}
              >
                <button
                  type="button"
                  onClick={() => setSelectedId(appointment.id)}
                  aria-label={`${appointment.customerName}, ${timeFormatter.format(appointment.startsAt)}, ${appointment.serviceName}, ${AGENDA_STATUS_LABEL[appointment.status]}`}
                  className={cn(
                    'flex w-full flex-col items-start gap-0 overflow-hidden rounded-md border px-1.5 py-1 text-left text-xs leading-tight transition-colors',
                    'hover:brightness-110',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-surface',
                    STATUS_BLOCK_STYLE[appointment.status],
                  )}
                  style={{ height: serviceHeight }}
                >
                  <span className="tnum font-medium">
                    {timeFormatter.format(appointment.startsAt)}
                  </span>
                  <span className="truncate">{appointment.customerName}</span>
                </button>
                {bufferHeight > 0 ? (
                  <div
                    aria-hidden="true"
                    className="rounded-b-md border border-t-0 border-border/50 opacity-50"
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

      <AppointmentSheet
        appointment={selected}
        timezone={timezone}
        onOpenChange={closeSheet}
      />
    </>
  )
}
