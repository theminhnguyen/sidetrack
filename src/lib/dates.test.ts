import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { daysSince, isCapacityStale } from './dates'
import { localNoon, localNoonISO } from '../test/localTime'

/**
 * All timestamps here sit at midday UTC on purpose. The staleness threshold
 * is measured in *local* calendar days, so a midnight-UTC fixture silently
 * becomes the previous day west of Greenwich and shifts the count by one —
 * which is exactly how an "one day short" case would pass in CEST and fail
 * in US timezones.
 */
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
