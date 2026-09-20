import { describe, expect, test } from 'vitest'
import { generateSlots, type SlotInput } from '@/domain/slots'
import { localDate, toInstant } from '@/domain/time'

const SP = 'America/Sao_Paulo'
const DATE = localDate('2026-03-10') // Tuesday
const at = (minute: number) => toInstant(DATE, minute, SP) as Date

const base: SlotInput = {
  date: DATE,
  timezone: SP,
  weeklyHours: [{ startMinute: 540, endMinute: 1080 }], // 09:00-18:00
  exception: null,
  service: { durationMinutes: 30, bufferMinutes: 0 },
  busy: [],
  now: new Date('2026-03-09T12:00:00.000Z'), // day before
  minNoticeMinutes: 120,
  maxAdvanceDays: 60,
}

const times = (input: SlotInput) =>
  generateSlots(input).map((s) => s.startsAt.toISOString())

describe('generateSlots', () => {
  test('fills the window on the 15-minute grid', () => {
    const slots = generateSlots(base)
    expect(slots[0]?.startsAt.toISOString()).toBe(at(540).toISOString())
    expect(slots.at(-1)?.startsAt.toISOString()).toBe(at(1050).toISOString())
    expect(slots).toHaveLength(35) // 09:00 .. 17:30 every 15 min
  })

  test('two windows produce a lunch gap with no slots between 12:00 and 13:00', () => {
    const slots = times({
      ...base,
      weeklyHours: [
        { startMinute: 540, endMinute: 720 },
        { startMinute: 780, endMinute: 1080 },
      ],
    })
    expect(slots).not.toContain(at(720).toISOString())
    expect(slots).not.toContain(at(750).toISOString())
    expect(slots).toContain(at(690).toISOString()) // 11:30 ends at 12:00
    expect(slots).toContain(at(780).toISOString()) // 13:00
  })

  test('a closed exception returns no slots even with weekly hours set', () => {
    expect(
      generateSlots({
        ...base,
        exception: { isClosed: true, startMinute: null, endMinute: null },
      }),
    ).toEqual([])
  })

  test('an exception with special hours overrides the whole day, never adds to it', () => {
    const slots = times({
      ...base,
      exception: { isClosed: false, startMinute: 600, endMinute: 660 },
    })
    expect(slots).toEqual([
      at(600).toISOString(),
      at(615).toISOString(),
      at(630).toISOString(),
    ])
  })

  test('buffer may run past closing time — only the duration must fit', () => {
    const slots = times({
      ...base,
      service: { durationMinutes: 45, bufferMinutes: 10 },
    })
    expect(slots).toContain(at(1035).toISOString()) // 17:15 + 45min = 18:00
  })

  test('buffer blocks the following slots of an existing appointment', () => {
    const slots = times({
      ...base,
      service: { durationMinutes: 30, bufferMinutes: 0 },
      busy: [{ start: at(600), end: at(645) }], // 10:00 booked + buffer until 10:45
    })
    expect(slots).not.toContain(at(600).toISOString())
    expect(slots).not.toContain(at(630).toISOString())
    expect(slots).toContain(at(645).toISOString())
  })

  test('minNoticeMinutes removes slots too close to now', () => {
    const slots = times({
      ...base,
      now: new Date('2026-03-10T12:00:00.000Z'), // 09:00 local
      minNoticeMinutes: 120,
    })
    expect(slots).not.toContain(at(600).toISOString()) // 10:00 is within 2h
    expect(slots).toContain(at(660).toISOString()) // 11:00 is exactly 2h out
  })

  test('maxAdvanceDays removes dates beyond the horizon', () => {
    expect(
      generateSlots({
        ...base,
        now: new Date('2026-01-01T12:00:00.000Z'),
        maxAdvanceDays: 10,
      }),
    ).toEqual([])
  })

  test('a service longer than every window yields no slots and terminates', () => {
    expect(
      generateSlots({
        ...base,
        service: { durationMinutes: 600, bufferMinutes: 0 },
      }),
    ).toEqual([])
  })

  test('no weekly hours and no exception yields no slots', () => {
    expect(generateSlots({ ...base, weeklyHours: [] })).toEqual([])
  })
})
