import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { shouldNudgeExport } from './dates'

describe('shouldNudgeExport (PLAN-V2 P1)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-15T12:00:00.000Z'))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('never nudges an empty board, no matter how stale the export', () => {
    expect(shouldNudgeExport(null, false)).toBe(false)
    expect(shouldNudgeExport('2020-01-01T00:00:00.000Z', false)).toBe(false)
  })

  it('nudges when there are tasks and nothing has ever been exported', () => {
    expect(shouldNudgeExport(null, true)).toBe(true)
  })

  it('does not nudge for a recent export', () => {
    expect(shouldNudgeExport('2026-08-10T00:00:00.000Z', true)).toBe(false) // 5 days ago
  })

  it('nudges once the last export is 14 or more days old', () => {
    expect(shouldNudgeExport('2026-08-01T00:00:00.000Z', true)).toBe(true) // 14 days ago
  })

  it('does not nudge one day short of the threshold', () => {
    expect(shouldNudgeExport('2026-08-02T00:00:00.000Z', true)).toBe(false) // 13 days ago
  })
})
