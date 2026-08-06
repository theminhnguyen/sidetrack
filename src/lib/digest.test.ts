import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildDigest, formatDigestText } from './digest'
import { createEmptyState } from '../types'
import { makeAuditEntry, makeTask, makeUser } from './testFactory'

const SINCE = '2026-07-20T00:00:00.000Z'
const BEFORE_SINCE = '2026-07-15T00:00:00.000Z'
const AFTER_SINCE = '2026-07-25T00:00:00.000Z'

function stateWith(overrides: Partial<ReturnType<typeof createEmptyState>>) {
  return { ...createEmptyState(), settings: { lastDigestAt: SINCE, miro: { enabled: false, boardId: null } }, ...overrides }
}

describe('buildDigest — first run', () => {
  it('flags isFirstEver and looks back 7 days when there is no baseline yet', () => {
    const state = { ...createEmptyState() }
    const digest = buildDigest(state)
    expect(digest.isFirstEver).toBe(true)
  })
})

describe('buildDigest — newly done', () => {
  it('includes tasks completed after the baseline', () => {
    const task = makeTask({ status: 'done', completedAt: AFTER_SINCE })
    const digest = buildDigest(stateWith({ tasks: [task] }))
    expect(digest.newlyDone).toEqual([task])
  })

  it('excludes tasks completed before the baseline', () => {
    const task = makeTask({ status: 'done', completedAt: BEFORE_SINCE })
    const digest = buildDigest(stateWith({ tasks: [task] }))
    expect(digest.newlyDone).toEqual([])
  })

  it('includes tasks created and completed within the same period', () => {
    const task = makeTask({ status: 'done', completedAt: AFTER_SINCE, createdAt: AFTER_SINCE })
    const digest = buildDigest(stateWith({ tasks: [task] }))
    expect(digest.newlyDone).toEqual([task])
  })
})

describe('buildDigest — shifted', () => {
  it('reports a due date that moved since the baseline', () => {
    const task = makeTask({ id: 't1', dueDate: '2026-08-15' })
    const shift = makeAuditEntry({
      taskId: 't1',
      type: 'deadline_shifted',
      timestamp: AFTER_SINCE,
      payload: { from: '2026-08-01', to: '2026-08-15', delta: '+2w', reason: 'Day job' },
    })
    const digest = buildDigest(stateWith({ tasks: [task], auditLog: [shift] }))
    expect(digest.shifted).toEqual([{ task, from: '2026-08-01', to: '2026-08-15', reason: 'Day job' }])
  })

  it('nets a snooze followed by a revert to "no change" (does not report it)', () => {
    const task = makeTask({ id: 't1', dueDate: '2026-08-01' }) // back to the original value
    const snooze = makeAuditEntry({
      taskId: 't1',
      type: 'deadline_shifted',
      timestamp: AFTER_SINCE,
      payload: { from: '2026-08-01', to: '2026-08-15', delta: '+2w', reason: 'Day job' },
    })
    const revert = makeAuditEntry({
      taskId: 't1',
      type: 'deadline_shifted',
      timestamp: '2026-07-26T00:00:00.000Z',
      payload: { from: '2026-08-15', to: '2026-08-01', delta: '-2w', reason: 'Back on track' },
    })
    const digest = buildDigest(stateWith({ tasks: [task], auditLog: [snooze, revert] }))
    expect(digest.shifted).toEqual([])
  })

  it('ignores shifts that happened before the baseline', () => {
    const task = makeTask({ id: 't1', dueDate: '2026-08-01' })
    const oldShift = makeAuditEntry({
      taskId: 't1',
      type: 'deadline_shifted',
      timestamp: BEFORE_SINCE,
      payload: { from: '2026-07-20', to: '2026-08-01', delta: '+2w', reason: 'Old news' },
    })
    const digest = buildDigest(stateWith({ tasks: [task], auditLog: [oldShift] }))
    expect(digest.shifted).toEqual([])
  })
})

describe('buildDigest — overdue', () => {
  // isOverdue reads the real clock, so it's pinned here — otherwise this
  // suite would silently start failing (or passing for the wrong reason)
  // as the calendar moves past the hardcoded task dates below.
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-10T12:00:00.000Z'))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('lists not-done tasks whose due date has already passed', () => {
    const task = makeTask({ status: 'in_progress', dueDate: '2026-08-01' })
    const digest = buildDigest(stateWith({ tasks: [task] }))
    expect(digest.overdue).toEqual([task])
  })

  it('excludes done tasks even if their due date has passed', () => {
    const task = makeTask({ status: 'done', dueDate: '2026-08-01', completedAt: AFTER_SINCE })
    const digest = buildDigest(stateWith({ tasks: [task] }))
    expect(digest.overdue).toEqual([])
  })

  it('excludes tasks whose due date is still ahead', () => {
    const task = makeTask({ status: 'in_progress', dueDate: '2026-08-20' })
    const digest = buildDigest(stateWith({ tasks: [task] }))
    expect(digest.overdue).toEqual([])
  })

  it('reports the correct singular/plural day count in the rendered text', () => {
    const oneDay = makeTask({ title: 'A', status: 'in_progress', dueDate: '2026-08-09' })
    const fiveDays = makeTask({ title: 'B', status: 'in_progress', dueDate: '2026-08-05' })
    const text = formatDigestText(buildDigest(stateWith({ tasks: [oneDay, fiveDays] })))
    expect(text).toContain('⚠️ Overdue (2)')
    expect(text).toContain('- A — due Aug 9 (1 day late)')
    expect(text).toContain('- B — due Aug 5 (5 days late)')
  })
})

describe('buildDigest — blocked', () => {
  it('lists currently blocked tasks regardless of when they were blocked', () => {
    const task = makeTask({ status: 'blocked', blockedReason: 'Waiting on vendor' })
    const digest = buildDigest(stateWith({ tasks: [task] }))
    expect(digest.blocked).toHaveLength(1)
    expect(digest.blocked[0].task).toBe(task)
  })
})

describe('buildDigest — capacity', () => {
  it('only includes active users', () => {
    const active = makeUser({ active: true })
    const inactive = makeUser({ active: false })
    const digest = buildDigest(stateWith({ users: [active, inactive] }))
    expect(digest.capacity).toEqual([active])
  })
})
