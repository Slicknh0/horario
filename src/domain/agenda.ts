import type { AppointmentStatus, TimeRange } from './types'

// A snapshot-only projection of an appointment row for the agenda UI —
// deliberately narrower than the full `appointment` table row: it never
// carries `tenantId`, `cancelToken` or `customerEmail` into the browser
// bundle, and every field it does carry is the row's own snapshot
// (serviceName, durationMinutes, bufferMinutes, priceCents), never
// re-derived from the service table — editing a service later must not
// rewrite what this appointment shows.
export type AgendaAppointment = {
  id: string
  customerName: string
  customerPhone: string
  serviceName: string
  durationMinutes: number
  bufferMinutes: number
  priceCents: number
  startsAt: Date
  endsAt: Date
  blockedUntil: Date
  status: AppointmentStatus
}

export type HourBounds = { startMinute: number; endMinute: number }

// The hour rows for a day's grid span the earliest to the latest configured
// minute across every weekly_hours window for that weekday, rounded out to
// whole hours so gridlines land on the hour. When the weekday has no
// configured hours at all (closed, or never set up) but the day still has
// appointments bleeding in from a neighboring day, `fallback` — a bound
// covering just those appointments — keeps the grid from collapsing to
// nothing while real data exists to show.
export function agendaHourBounds(
  weeklyHours: TimeRange[],
  fallback: HourBounds | null,
): HourBounds | null {
  if (weeklyHours.length === 0) return fallback

  let start = weeklyHours[0]?.startMinute ?? 0
  let end = weeklyHours[0]?.endMinute ?? 0
  for (const window of weeklyHours) {
    if (window.startMinute < start) start = window.startMinute
    if (window.endMinute > end) end = window.endMinute
  }

  return {
    startMinute: Math.max(0, Math.floor(start / 60) * 60),
    endMinute: Math.min(24 * 60, Math.ceil(end / 60) * 60),
  }
}

export type DaySegment = {
  startMinute: number
  serviceMinutes: number
  bufferMinutes: number
}

const MINUTE_MS = 60_000

// Clips an appointment's three timestamps (startsAt / endsAt / blockedUntil)
// to the portion that actually falls inside [dayStart, dayEnd) — the same
// window `listAppointmentsBetween` was queried with. An appointment that
// began yesterday and runs into today (or one that runs past tonight's
// midnight) still renders, but only the slice of it that belongs to this
// day's column. `startMinute` is elapsed minutes since `dayStart`, which is
// itself the tenant-timezone midnight instant for this day, so no separate
// per-timezone minute-of-day lookup is needed here — the subtraction alone
// gives the local minute of day.
export function daySegment(
  appointment: { startsAt: Date; endsAt: Date; blockedUntil: Date },
  dayStart: Date,
  dayEnd: Date,
): DaySegment | null {
  const segStart =
    appointment.startsAt < dayStart ? dayStart : appointment.startsAt
  const serviceEnd = appointment.endsAt > dayEnd ? dayEnd : appointment.endsAt
  const bufferEnd =
    appointment.blockedUntil > dayEnd ? dayEnd : appointment.blockedUntil

  if (segStart >= dayEnd || bufferEnd <= dayStart) return null

  const startMinute = (segStart.getTime() - dayStart.getTime()) / MINUTE_MS
  const serviceMinutes = Math.max(
    0,
    (serviceEnd.getTime() - segStart.getTime()) / MINUTE_MS,
  )
  const bufferMinutes = Math.max(
    0,
    (bufferEnd.getTime() - serviceEnd.getTime()) / MINUTE_MS,
  )

  return { startMinute, serviceMinutes, bufferMinutes }
}

// Portuguese label for each status — used by the agenda blocks' aria-label
// and by the sheet's badge, so the two can never drift into two different
// words for the same status. Not routed through messageFor: that function
// is for error codes (see src/lib/errors.ts), and a status is not an error.
export const AGENDA_STATUS_LABEL: Record<AppointmentStatus, string> = {
  confirmed: 'Confirmado',
  completed: 'Concluído',
  cancelled: 'Cancelado',
  no_show: 'Não veio',
}

export type SegmentLayout = DaySegment & {
  laneIndex: number
  laneCount: number
}

// Marking an appointment cancelled or no_show frees its slot for a new
// booking (ruling 4) — which means two rows can legitimately occupy the
// same window on the same day: the historical no_show/cancelled row and
// whatever got booked into the freed slot afterward. Rendering both at the
// same absolute position would hide one under the other, so overlapping
// segments are packed into side-by-side lanes instead, the same technique
// a day-view calendar uses. Lane assignment is a standard greedy interval
// sweep: sort by start, reuse the lowest lane number not already occupied
// by a still-open interval, and open a new "cluster" (starting the lane
// count over) whenever the active set empties out — the lane count is
// applied per cluster, not per pair, so widths stay consistent across an
// entire connected run of overlaps rather than shifting mid-run.
export function layoutDaySegments(
  appointments: {
    id: string
    startsAt: Date
    endsAt: Date
    blockedUntil: Date
  }[],
  dayStart: Date,
  dayEnd: Date,
): Map<string, SegmentLayout> {
  type Sortable = { id: string; seg: DaySegment; blockEnd: number }

  const items: Sortable[] = []
  for (const appointment of appointments) {
    const seg = daySegment(appointment, dayStart, dayEnd)
    if (!seg) continue
    items.push({
      id: appointment.id,
      seg,
      blockEnd: seg.startMinute + seg.serviceMinutes + seg.bufferMinutes,
    })
  }
  items.sort((a, b) => a.seg.startMinute - b.seg.startMinute)

  const result = new Map<string, SegmentLayout>()
  let active: { end: number; lane: number }[] = []
  let cluster: Sortable[] = []
  let clusterLanes = 0

  function flushCluster() {
    for (const item of cluster) {
      const layout = result.get(item.id)
      if (layout) layout.laneCount = clusterLanes
    }
    cluster = []
    clusterLanes = 0
  }

  for (const item of items) {
    active = active.filter((a) => a.end > item.seg.startMinute)
    if (active.length === 0 && cluster.length > 0) flushCluster()

    const usedLanes = new Set(active.map((a) => a.lane))
    let lane = 0
    while (usedLanes.has(lane)) lane++

    active.push({ end: item.blockEnd, lane })
    cluster.push(item)
    clusterLanes = Math.max(clusterLanes, lane + 1)
    result.set(item.id, { ...item.seg, laneIndex: lane, laneCount: 1 })
  }
  flushCluster()

  return result
}
