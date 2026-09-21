import { err, ok, type Result, type TimeRange } from './types'

// Pure validation for the intervals an owner submits for one weekday, or for
// a single exception's open hours. No framework imports: this is the same
// rule the UI, the action and a future importer would all need to agree on,
// so it lives once, here, and every caller (action, test) imports it rather
// than re-deriving it.
//
// Ranges are minutes-from-midnight, half-open [start, end): two ranges that
// touch (one ends exactly where the next starts) are adjacent, not
// overlapping — that's how a lunch break is expressed as "no third row",
// not a special case.
export function validateRanges(
  ranges: TimeRange[],
): Result<void, 'RANGE_INVALID' | 'RANGE_OVERLAP'> {
  for (const r of ranges) {
    if (!Number.isInteger(r.startMinute) || !Number.isInteger(r.endMinute)) {
      return err('RANGE_INVALID')
    }
    if (r.startMinute < 0 || r.endMinute > 1440) return err('RANGE_INVALID')
    if (r.startMinute >= r.endMinute) return err('RANGE_INVALID')
  }

  const sorted = [...ranges].sort((a, b) => a.startMinute - b.startMinute)
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1]
    const curr = sorted[i]
    if (prev && curr && curr.startMinute < prev.endMinute) {
      return err('RANGE_OVERLAP')
    }
  }

  return ok(undefined)
}
