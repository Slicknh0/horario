import { describe, expect, test } from 'vitest'
import { layoutDaySegments, type SegmentLayout } from '@/domain/agenda'

// A fixed anchor rather than `new Date()`: every case below is expressed as
// "minutes since dayStart", so the anchor's actual value is irrelevant as
// long as it's stable within a test file.
const DAY_START = new Date('2026-03-10T00:00:00.000Z')
const DAY_END = new Date('2026-03-11T00:00:00.000Z')

function at(minute: number): Date {
  return new Date(DAY_START.getTime() + minute * 60_000)
}

// Builds a minimal appointment-shaped object: `startsAt`/`endsAt` cover the
// service itself, `blockedUntil` is `endsAt + bufferMinutes` — the same
// relationship book-appointment.ts writes to the real column.
function appt(
  id: string,
  startMinute: number,
  serviceMinutes: number,
  bufferMinutes = 0,
) {
  return {
    id,
    startsAt: at(startMinute),
    endsAt: at(startMinute + serviceMinutes),
    blockedUntil: at(startMinute + serviceMinutes + bufferMinutes),
  }
}

function layoutOf(
  result: Map<string, SegmentLayout>,
  id: string,
): SegmentLayout {
  const entry = result.get(id)
  if (!entry) throw new Error(`expected a layout entry for ${id}`)
  return entry
}

describe('layoutDaySegments', () => {
  test('two appointments that do not overlap share one lane', () => {
    const items = [appt('a', 0, 30), appt('b', 60, 30)]
    const result = layoutDaySegments(items, DAY_START, DAY_END)

    expect(layoutOf(result, 'a').laneIndex).toBe(0)
    expect(layoutOf(result, 'a').laneCount).toBe(1)
    expect(layoutOf(result, 'b').laneIndex).toBe(0)
    expect(layoutOf(result, 'b').laneCount).toBe(1)
  })

  // This is exactly the case a freed no_show slot creates: the historical
  // no_show row and whatever got booked into its freed slot afterward can
  // legitimately occupy overlapping time on the same day (ruling 4), and
  // both need a visible lane rather than one hiding behind the other.
  test('two appointments overlapping in time get different lanes', () => {
    const items = [appt('a', 0, 30), appt('b', 15, 30)]
    const result = layoutDaySegments(items, DAY_START, DAY_END)

    const a = layoutOf(result, 'a')
    const b = layoutOf(result, 'b')
    expect(a.laneIndex).not.toBe(b.laneIndex)
    expect(a.laneCount).toBe(2)
    expect(b.laneCount).toBe(2)
  })

  test('three mutually overlapping appointments get three distinct lanes', () => {
    const items = [appt('a', 0, 100), appt('b', 10, 80), appt('c', 20, 60)]
    const result = layoutDaySegments(items, DAY_START, DAY_END)

    const lanes = new Set(
      ['a', 'b', 'c'].map((id) => layoutOf(result, id).laneIndex),
    )
    expect(lanes.size).toBe(3)
    for (const id of ['a', 'b', 'c']) {
      expect(layoutOf(result, id).laneCount).toBe(3)
    }
  })

  // The block a click target and the buffer's hatched extension together
  // occupy blockedUntil - startsAt, not endsAt - startsAt — so a second
  // appointment that starts inside the first one's buffer must still be
  // treated as overlapping, even though the two services themselves never
  // touch. Without this, two blocks would visually collide on screen while
  // this helper reported them as non-overlapping.
  test("an appointment starting inside the previous one's buffer is treated as overlapping", () => {
    // 'a': service 0-30, buffer 30-40 (10-minute buffer) -> blocked until 40.
    const a = appt('a', 0, 30, 10)
    // 'b' starts at 35: after 'a' finishes its service (30) but still
    // inside 'a''s buffer extension (30-40).
    const b = appt('b', 35, 20)
    const result = layoutDaySegments([a, b], DAY_START, DAY_END)

    const layoutA = layoutOf(result, 'a')
    const layoutB = layoutOf(result, 'b')
    expect(layoutA.laneIndex).not.toBe(layoutB.laneIndex)
    expect(layoutA.laneCount).toBe(2)
    expect(layoutB.laneCount).toBe(2)
  })

  // A control case alongside the previous one: 'b' starting at 40 (exactly
  // when 'a''s buffer ends, not inside it) does NOT overlap — confirming
  // the previous test exercises the buffer boundary specifically, rather
  // than every pair of appointments happening to land in different lanes
  // regardless of timing.
  test("an appointment starting exactly when the previous one's buffer ends does not overlap", () => {
    const a = appt('a', 0, 30, 10) // blocked until 40
    const b = appt('b', 40, 20)
    const result = layoutDaySegments([a, b], DAY_START, DAY_END)

    expect(layoutOf(result, 'a').laneIndex).toBe(0)
    expect(layoutOf(result, 'b').laneIndex).toBe(0)
    expect(layoutOf(result, 'a').laneCount).toBe(1)
    expect(layoutOf(result, 'b').laneCount).toBe(1)
  })

  test('the output is deterministic and does not depend on input order', () => {
    const a = appt('a', 0, 100)
    const b = appt('b', 10, 80)
    const c = appt('c', 20, 60)
    const d = appt('d', 200, 30) // isolated, in a separate cluster

    const forward = layoutDaySegments([a, b, c, d], DAY_START, DAY_END)
    const shuffled = layoutDaySegments([d, c, a, b], DAY_START, DAY_END)
    const reversed = layoutDaySegments([d, c, b, a], DAY_START, DAY_END)

    for (const id of ['a', 'b', 'c', 'd']) {
      const expected = layoutOf(forward, id)
      expect(layoutOf(shuffled, id)).toEqual(expected)
      expect(layoutOf(reversed, id)).toEqual(expected)
    }
  })
})
