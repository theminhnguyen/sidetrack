import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { daysSince, isCapacityStale, shouldNudgeExport } from './dates'
import { localNoon, localNoonISO } from '../test/localTime'

/**
 * All timestamps here sit at midday UTC on purpose. Both thresholds are
 * measured in *local* calendar days, so a midnight-UTC fixture silently
 * becomes the previous day west of Greenwich and shifts every count by one —
 * which is exactly how the "one day short" cases below used to pass in CEST
 * and fail in US timezones.
 */
describe('shouldNudgeExport (PLAN-V2 P1)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(localNoon(2026, 8, 15))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('never nudges an empty board, no matter how stale the export', () => {
    expect(shouldNudgeExport(null, false)).toBe(false)
    expect(shouldNudgeExport(localNoonISO(2020, 1, 1), false)).toBe(false)
  })

  it('nudges when there are tasks and nothing has ever been exported', () => {
    expect(shouldNudgeExport(null, true)).toBe(true)
  })

  it('does not nudge for a recent export', () => {
    expect(shouldNudgeExport(localNoonISO(2026, 8, 10), true)).toBe(false) // 5 days ago
  })

  it('nudges once the last export is 14 or more days old', () => {
    expect(shouldNudgeExport(localNoonISO(2026, 8, 1), true)).toBe(true) // 14 days ago
  })

  it('does not nudge one day short of the threshold', () => {
    expect(shouldNudgeExport(localNoonISO(2026, 8, 2), true)).toBe(false) // 13 days ago
  })
})

describe('capacity staleness', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(localNoon(2026, 8, 15))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  // Timestamps are pinned to midday so the assertions can't flip depending on
  // the runner's timezone: differenceInCalendarDays compares *local* calendar
  // days, so a late-evening UTC value can already be "tomorrow" in CEST.
  it('counts whole calendar days since the timestamp', () => {
    expect(daysSince(localNoonISO(2026, 8, 15))).toBe(0)
    expect(daysSince(localNoonISO(2026, 8, 14))).toBe(1)
    expect(daysSince(localNoonISO(2026, 8, 1))).toBe(14)
  })

  it('treats a light untouched for 14+ days as stale', () => {
    expect(isCapacityStale(localNoonISO(2026, 8, 1))).toBe(true)
  })

  it('leaves a recently confirmed light alone', () => {
    expect(isCapacityStale(localNoonISO(2026, 8, 10))).toBe(false)
  })

  it('does not flag one day short of the threshold', () => {
    expect(isCapacityStale(localNoonISO(2026, 8, 2))).toBe(false) // 13 days
  })
})
