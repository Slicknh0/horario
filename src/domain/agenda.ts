import type { AppointmentStatus, TimeRange } from './types'

// This module is pure business/layout logic: minutes in, minutes (or lane
// numbers) out, no React, no framework, and — per the spec — no language.
// "O domínio não conhece idioma": every string a human reads (status
// labels, the danger/no_show styling) lives in src/lib/agenda-status.ts
// instead, which both agenda views and the sheet import from.

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

// The other half of the fallback computation above: when a weekday has no
// configured hours at all, the bound instead covers whatever appointments
// actually landed on it. Was duplicated verbatim (a ~15-line IIFE) in both
// agenda-day.tsx and agenda-week.tsx; extracted here so a future change to
// how the fallback is computed can't land in one view and not the other.
export function fallbackHourBounds(
  segments: Iterable<{
    startMinute: number
    serviceMinutes: number
    bufferMinutes: number
  }>,
): HourBounds | null {
  let min = Number.POSITIVE_INFINITY
  let max = Number.NEGATIVE_INFINITY
  for (const segment of segments) {
    min = Math.min(min, segment.startMinute)
    max = Math.max(
      max,
      segment.startMinute + segment.serviceMinutes + segment.bufferMinutes,
    )
  }
  if (!Number.isFinite(min)) return null
  return {
    startMinute: Math.max(0, Math.floor(min / 60) * 60),
    endMinute: Math.min(24 * 60, Math.ceil(max / 60) * 60),
  }
}

// "09:00" from a minute-of-day — plain zero-padded arithmetic, no locale
// involved, so it belongs beside the rest of this module's language-free
// layout math rather than duplicated per view.
export function hourLabel(minute: number): string {
  const h = Math.floor(minute / 60) % 24
  const m = minute % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
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

export type SegmentLayout = DaySegment & {
  laneIndex: number
  laneCount: number
  // Minutes of true, gap-guaranteed clearance before the next appointment
  // whose horizontal footprint on screen (`[laneIndex/laneCount,
  // (laneIndex+1)/laneCount]`) genuinely intersects this one's — `null`
  // when nothing follows it there. Deliberately NOT "the next occupant of
  // the same lane NUMBER": lane numbers are renumbered per cluster, so the
  // same number can mean a different horizontal slice on either side of a
  // cluster boundary, and a later, wider lane can span what used to be
  // several narrower ones. This is what stops a rendering floor (a
  // minimum pixel height for legibility on a very short appointment) from
  // drawing into where a block that's genuinely below it on screen
  // begins: see blockPixelHeights below, which is the only thing that
  // should ever consume this field.
  availableMinutes: number | null
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
    result.set(item.id, {
      ...item.seg,
      laneIndex: lane,
      laneCount: 1,
      availableMinutes: null,
    })
  }
  flushCluster()

  // Second pass: for each item (already in start order, from the initial
  // sort), find the earliest subsequent item whose horizontal footprint on
  // screen genuinely intersects its own, and record the time gap to it.
  // This must key on footprint, not lane number: two items can share a
  // lane number across a cluster boundary while occupying different
  // horizontal slices (the number was reused, the column wasn't), and two
  // items can have different lane numbers while genuinely sharing screen
  // space (a later, single-lane cluster's block spans 0-100% width, so it
  // overlaps every lane number an earlier, multi-lane cluster used).
  // Matching on the number alone misses exactly that second case — see the
  // "B's lane number never recurs" test below, which is the counterexample
  // that caught it. Two footprints intersect via the same half-open
  // interval test generateSlots already uses for time
  // (`aStart < bEnd && bStart < aEnd`), applied to the horizontal axis.
  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    if (!item) continue
    const layout = result.get(item.id)
    if (!layout) continue
    const aStart = layout.laneIndex / layout.laneCount
    const aEnd = (layout.laneIndex + 1) / layout.laneCount

    for (let j = i + 1; j < items.length; j++) {
      const other = items[j]
      if (!other) continue
      const otherLayout = result.get(other.id)
      if (!otherLayout) continue
      const bStart = otherLayout.laneIndex / otherLayout.laneCount
      const bEnd = (otherLayout.laneIndex + 1) / otherLayout.laneCount
      if (aStart < bEnd && bStart < aEnd) {
        layout.availableMinutes = other.seg.startMinute - layout.startMinute
        break
      }
    }
  }

  return result
}

export type BlockPixelHeights = { servicePx: number; bufferPx: number }

// The rendering floor (a minimum pixel height so a very short appointment
// is still legible/tappable) is a nicety, never a promise the layout can
// break: it must never draw past `availableMinutes` — the true, verified
// gap to the next appointment whose drawn footprint overlaps this one's.
// Without this clamp, a service under the floor's equivalent duration
// renders taller than it lasts, and because the buffer's fainter extension
// stacks right after it, the pair can visually run into an appointment
// that layoutDaySegments correctly decided does not overlap in time — the
// algorithm is right and the pixels lie. Shared by both agenda views
// (which use different pxPerMinute/floor values) rather than duplicated,
// since this exact geometry mistake is cheap to reintroduce independently
// in each one.
export function blockPixelHeights(
  entry: SegmentLayout,
  pxPerMinute: number,
  minBlockHeightPx: number,
): BlockPixelHeights {
  const trueServicePx = entry.serviceMinutes * pxPerMinute
  const trueBufferPx = entry.bufferMinutes * pxPerMinute
  const maxPx =
    entry.availableMinutes === null
      ? Number.POSITIVE_INFINITY
      : entry.availableMinutes * pxPerMinute

  const servicePx = Math.min(Math.max(trueServicePx, minBlockHeightPx), maxPx)
  const bufferPx = Math.max(0, Math.min(trueBufferPx, maxPx - servicePx))

  return { servicePx, bufferPx }
}
