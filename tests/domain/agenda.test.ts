import { describe, expect, test } from 'vitest'
import {
  blockPixelHeights,
  layoutDaySegments,
  type SegmentLayout,
} from '@/domain/agenda'

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

  describe('availableMinutes', () => {
    test('is the gap to the next appointment in the same lane', () => {
      // Both non-overlapping, so both land in lane 0: 'a' at 0-30, 'b' at
      // 60-90. The gap that matters is start-to-start (60 - 0), not
      // end-to-start — that's the true amount of vertical room 'a' has
      // before 'b' visually begins, regardless of how short 'a' itself is.
      const items = [appt('a', 0, 30), appt('b', 60, 30)]
      const result = layoutDaySegments(items, DAY_START, DAY_END)

      expect(layoutOf(result, 'a').availableMinutes).toBe(60)
      expect(layoutOf(result, 'b').availableMinutes).toBeNull()
    })

    test('is null for the last appointment in its lane', () => {
      // Three mutually overlapping: three lanes, and every one of them is
      // the last (and only) occupant of its own lane.
      const items = [appt('a', 0, 100), appt('b', 10, 80), appt('c', 20, 60)]
      const result = layoutDaySegments(items, DAY_START, DAY_END)

      for (const id of ['a', 'b', 'c']) {
        expect(layoutOf(result, id).availableMinutes).toBeNull()
      }
    })
  })
})

describe('blockPixelHeights', () => {
  const PX_PER_MINUTE = 2
  const MIN_BLOCK_HEIGHT = 28

  // A 10-minute service at 2px/minute is 20px — under the 28px legibility
  // floor — and nothing follows it in its lane, so the floor applies with
  // no clamp needed.
  test('applies the floor in full when there is nothing after it in the lane', () => {
    const entry: SegmentLayout = {
      startMinute: 0,
      serviceMinutes: 10,
      bufferMinutes: 0,
      laneIndex: 0,
      laneCount: 1,
      availableMinutes: null,
    }
    const { servicePx, bufferPx } = blockPixelHeights(
      entry,
      PX_PER_MINUTE,
      MIN_BLOCK_HEIGHT,
    )
    expect(servicePx).toBe(MIN_BLOCK_HEIGHT)
    expect(bufferPx).toBe(0)
  })

  // This is Important 1 from the review, reproduced directly: a 10-minute
  // service (20px true height) with the next appointment in its lane only
  // 12 minutes away (24px of true clearance). Flooring to 28px would draw
  // 4px into where the next block begins even though layoutDaySegments
  // correctly decided the two do not overlap in time — servicePx must
  // never exceed availableMinutes converted to pixels.
  test('clamps the floor to the true gap before the next block in the lane', () => {
    const entry: SegmentLayout = {
      startMinute: 0,
      serviceMinutes: 10,
      bufferMinutes: 0,
      laneIndex: 0,
      laneCount: 1,
      availableMinutes: 12,
    }
    const { servicePx, bufferPx } = blockPixelHeights(
      entry,
      PX_PER_MINUTE,
      MIN_BLOCK_HEIGHT,
    )
    expect(servicePx).toBe(24) // 12 minutes * 2px/min, not the 28px floor
    expect(bufferPx).toBe(0)
  })

  // A true (unfloored) service height that's already >= the floor is
  // rendered at its true size, never shrunk — the floor is a minimum, not
  // a target.
  test('renders at true size when the true height already exceeds the floor', () => {
    const entry: SegmentLayout = {
      startMinute: 0,
      serviceMinutes: 30,
      bufferMinutes: 10,
      laneIndex: 0,
      laneCount: 1,
      availableMinutes: null,
    }
    const { servicePx, bufferPx } = blockPixelHeights(
      entry,
      PX_PER_MINUTE,
      MIN_BLOCK_HEIGHT,
    )
    expect(servicePx).toBe(60) // 30 min * 2px/min
    expect(bufferPx).toBe(20) // 10 min * 2px/min
  })

  // When there's only enough room for the (floored) service block itself,
  // the buffer's fainter extension is the first thing to give — it's
  // decorative, the service block is the click target and must not shrink
  // below what the gap allows either.
  test('shrinks the buffer before it would let the pair exceed the available gap', () => {
    const entry: SegmentLayout = {
      startMinute: 0,
      serviceMinutes: 10, // true 20px
      bufferMinutes: 10, // true 20px more
      laneIndex: 0,
      laneCount: 1,
      availableMinutes: 12, // only 24px of true clearance in total
    }
    const { servicePx, bufferPx } = blockPixelHeights(
      entry,
      PX_PER_MINUTE,
      MIN_BLOCK_HEIGHT,
    )
    expect(servicePx + bufferPx).toBeLessThanOrEqual(24)
    expect(servicePx).toBe(24)
    expect(bufferPx).toBe(0)
  })
})
