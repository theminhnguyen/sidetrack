import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAppStore } from './useAppStore'
import { readTestStorage, resetTestStorage } from '../test/setup'
import { localNoon } from '../test/localTime'

/**
 * These cover regressions found during the post-implementation review, so the
 * fixed behaviour stays fixed. Storage is the in-memory stub from the setup file.
 */
beforeEach(() => {
  resetTestStorage()
})

function freshTask(dueDate: string) {
  const task = useAppStore.getState().addTask({ title: 'T', assigneeId: null, dueDate, startDate: dueDate })
  return task.id
}

describe('renameUser', () => {
  it('re-derives initials so the avatar matches the new name', () => {
    const user = useAppStore.getState().addUser('Alex Chen')
    expect(user.initials).toBe('AC')

    useAppStore.getState().renameUser(user.id, 'Bob Smith')
    const renamed = useAppStore.getState().users.find((u) => u.id === user.id)
    expect(renamed?.initials).toBe('BS')
  })
})

describe('shiftDueDate — snoozeCount semantics', () => {
  it('counts a slip when the date moves later', () => {
    const id = freshTask('2026-08-01')
    useAppStore.getState().shiftDueDate(id, '2026-08-15', 'Day job', 'manual')
    expect(useAppStore.getState().tasks.find((t) => t.id === id)?.snoozeCount).toBe(1)
  })

  it('does not count pulling a deadline forward as a slip', () => {
    const id = freshTask('2026-08-15')
    useAppStore.getState().shiftDueDate(id, '2026-08-01', 'Finished early', 'manual')
    const task = useAppStore.getState().tasks.find((t) => t.id === id)
    expect(task?.snoozeCount).toBe(0)
    expect(task?.dueDate).toBe('2026-08-01')
  })
})

describe('setTaskStatus — completedAt lifecycle', () => {
  it('stamps completedAt when a task is first marked done', () => {
    const id = freshTask('2026-08-01')
    useAppStore.getState().setTaskStatus(id, 'done')
    expect(useAppStore.getState().tasks.find((t) => t.id === id)?.completedAt).not.toBeNull()
  })

  it('keeps the original completedAt when done is re-applied', () => {
    const id = freshTask('2026-08-01')
    useAppStore.getState().setTaskStatus(id, 'done')
    const first = useAppStore.getState().tasks.find((t) => t.id === id)?.completedAt

    useAppStore.getState().setTaskStatus(id, 'done')
    expect(useAppStore.getState().tasks.find((t) => t.id === id)?.completedAt).toBe(first)
  })

  it('clears completedAt when a done task is reopened', () => {
    const id = freshTask('2026-08-01')
    useAppStore.getState().setTaskStatus(id, 'done')
    useAppStore.getState().setTaskStatus(id, 'in_progress')
    expect(useAppStore.getState().tasks.find((t) => t.id === id)?.completedAt).toBeNull()
  })
})

describe('setTaskStatus — celebration signal', () => {
  it('fires once when a task first crosses into done', () => {
    const id = freshTask('2026-08-01')
    useAppStore.getState().clearCelebration()

    useAppStore.getState().setTaskStatus(id, 'done')
    expect(useAppStore.getState().celebration?.taskId).toBe(id)
  })

  it('does not re-fire when done is re-applied to an already-done task', () => {
    const id = freshTask('2026-08-01')
    useAppStore.getState().setTaskStatus(id, 'done')
    useAppStore.getState().clearCelebration()

    useAppStore.getState().setTaskStatus(id, 'done')
    expect(useAppStore.getState().celebration).toBeNull()
  })

  it('fires again after a task is reopened and completed a second time', () => {
    const id = freshTask('2026-08-01')
    useAppStore.getState().setTaskStatus(id, 'done')
    useAppStore.getState().setTaskStatus(id, 'in_progress')
    useAppStore.getState().clearCelebration()

    useAppStore.getState().setTaskStatus(id, 'done')
    expect(useAppStore.getState().celebration?.taskId).toBe(id)
  })
})

describe('shiftStartDate', () => {
  it('writes an audit entry so Gantt drags of the bar start are traceable', () => {
    const id = freshTask('2026-08-01')
    const before = useAppStore.getState().auditLog.length

    useAppStore.getState().shiftStartDate(id, '2026-07-20', 'Started earlier')

    const added = useAppStore.getState().auditLog.slice(before)
    const entry = added.find((e) => e.type === 'deadline_shifted' && e.payload.field === 'startDate')
    expect(entry).toBeDefined()
    expect(entry?.payload.from).toBe('2026-08-01')
    expect(entry?.payload.to).toBe('2026-07-20')
  })

  it('is a no-op when the date has not actually changed', () => {
    const id = freshTask('2026-08-01')
    const before = useAppStore.getState().auditLog.length
    useAppStore.getState().shiftStartDate(id, '2026-08-01', 'No change')
    expect(useAppStore.getState().auditLog.length).toBe(before)
  })

  it('pulls the due date along rather than inverting the range', () => {
    // Both dates start equal (freshTask), so any later start date would
    // otherwise leave startDate > dueDate — the state that crashes the Gantt.
    const id = freshTask('2026-08-01')
    useAppStore.getState().shiftStartDate(id, '2026-08-10', 'Started later')
    const task = useAppStore.getState().tasks.find((t) => t.id === id)
    expect(task?.startDate).toBe('2026-08-10')
    expect(task?.dueDate).toBe('2026-08-10')
  })
})

describe('shiftDueDate — range invariant', () => {
  it('pulls the start date along rather than inverting the range', () => {
    const id = freshTask('2026-08-15')
    useAppStore.getState().shiftDueDate(id, '2026-08-01', 'Pulled forward', 'manual')
    const task = useAppStore.getState().tasks.find((t) => t.id === id)
    expect(task?.dueDate).toBe('2026-08-01')
    expect(task?.startDate).toBe('2026-08-01')
  })

  it('leaves the start date alone when the range stays valid', () => {
    const task = useAppStore.getState().addTask({
      title: 'T',
      assigneeId: null,
      startDate: '2026-08-01',
      dueDate: '2026-08-20',
    })
    useAppStore.getState().shiftDueDate(task.id, '2026-08-10', 'Pulled forward a bit', 'manual')
    const updated = useAppStore.getState().tasks.find((t) => t.id === task.id)
    expect(updated?.dueDate).toBe('2026-08-10')
    expect(updated?.startDate).toBe('2026-08-01')
  })
})

describe('confirmCascadeSuggestion — stale plan validation (PLAN-V2 P0.1)', () => {
  it('drops a shift whose assumed starting date no longer matches, and does not log or apply it', () => {
    const rootId = freshTask('2026-08-01')
    const depId = freshTask('2026-08-05')
    useAppStore.getState().setDependsOn(depId, [rootId])

    // A plan computed earlier, now stale: something (e.g. an import) moved
    // the dependent's due date without going through the suggestion at all.
    useAppStore.setState({
      cascadeSuggestion: {
        rootTaskId: rootId,
        rootTitle: 'T',
        plan: [{ taskId: depId, title: 'T', from: '2026-08-05', to: '2026-08-19' }],
      },
    })
    useAppStore.setState((s) => ({
      tasks: s.tasks.map((t) => (t.id === depId ? { ...t, dueDate: '2026-08-10' } : t)),
    }))
    const auditBefore = useAppStore.getState().auditLog.length

    useAppStore.getState().confirmCascadeSuggestion()

    const dep = useAppStore.getState().tasks.find((t) => t.id === depId)
    expect(dep?.dueDate).toBe('2026-08-10') // not overwritten to the stale '2026-08-19'
    expect(useAppStore.getState().auditLog.length).toBe(auditBefore) // no false "from" logged
    expect(useAppStore.getState().cascadeSuggestion).toBeNull()
    expect(useAppStore.getState().cascadeAppliedNote).toContain('1 of 1')
  })

  it('applies only the still-valid shifts when a plan is partially stale', () => {
    const rootId = freshTask('2026-08-01')
    const dep1 = freshTask('2026-08-05')
    const dep2 = freshTask('2026-08-06')
    useAppStore.getState().setDependsOn(dep1, [rootId])
    useAppStore.getState().setDependsOn(dep2, [rootId])
    useAppStore.setState({
      cascadeSuggestion: {
        rootTaskId: rootId,
        rootTitle: 'T',
        plan: [
          { taskId: dep1, title: 'T', from: '2026-08-05', to: '2026-08-19' },
          { taskId: dep2, title: 'T', from: '2026-08-06', to: '2026-08-20' },
        ],
      },
    })
    useAppStore.setState((s) => ({
      tasks: s.tasks.map((t) => (t.id === dep1 ? { ...t, dueDate: '2026-08-11' } : t)),
    }))

    useAppStore.getState().confirmCascadeSuggestion()

    const tasks = useAppStore.getState().tasks
    expect(tasks.find((t) => t.id === dep1)?.dueDate).toBe('2026-08-11') // stale, left alone
    expect(tasks.find((t) => t.id === dep2)?.dueDate).toBe('2026-08-20') // still valid, applied
    expect(useAppStore.getState().cascadeAppliedNote).toContain('1 of 2')
  })

  it('applies the full plan and sets no note when nothing went stale', () => {
    const rootId = freshTask('2026-08-01')
    const depId = freshTask('2026-08-05')
    useAppStore.getState().setDependsOn(depId, [rootId])
    useAppStore.setState({
      cascadeSuggestion: {
        rootTaskId: rootId,
        rootTitle: 'T',
        plan: [{ taskId: depId, title: 'T', from: '2026-08-05', to: '2026-08-19' }],
      },
    })

    useAppStore.getState().confirmCascadeSuggestion()

    expect(useAppStore.getState().tasks.find((t) => t.id === depId)?.dueDate).toBe('2026-08-19')
    expect(useAppStore.getState().cascadeAppliedNote).toBeNull()
  })
})

describe('cascade suggestion replacement (PLAN-V2 P0.2)', () => {
  it('snoozeTask replaces a stale suggestion instead of keeping it when the new snooze has no conflicts', () => {
    const rootId = freshTask('2026-08-01')
    const depId = freshTask('2026-08-05')
    useAppStore.getState().setDependsOn(depId, [rootId])
    useAppStore.getState().snoozeTask(rootId, 2, 'Day job', false)
    expect(useAppStore.getState().cascadeSuggestion).not.toBeNull()

    const otherId = freshTask('2026-09-01')
    useAppStore.getState().snoozeTask(otherId, 1, 'Waiting on others', false)

    expect(useAppStore.getState().cascadeSuggestion).toBeNull()
  })

  it('shiftDueDate clears an existing suggestion — it never recomputes one of its own', () => {
    const rootId = freshTask('2026-08-01')
    const depId = freshTask('2026-08-05')
    useAppStore.getState().setDependsOn(depId, [rootId])
    useAppStore.getState().snoozeTask(rootId, 2, 'Day job', false)
    expect(useAppStore.getState().cascadeSuggestion).not.toBeNull()

    useAppStore.getState().shiftDueDate(depId, '2026-08-10', 'Manual tweak', 'manual')
    expect(useAppStore.getState().cascadeSuggestion).toBeNull()
  })

  it('shiftStartDate clears an existing suggestion', () => {
    const rootId = freshTask('2026-08-01')
    const depId = freshTask('2026-08-05')
    useAppStore.getState().setDependsOn(depId, [rootId])
    useAppStore.getState().snoozeTask(rootId, 2, 'Day job', false)
    expect(useAppStore.getState().cascadeSuggestion).not.toBeNull()

    useAppStore.getState().shiftStartDate(depId, '2026-08-04', 'Started earlier')
    expect(useAppStore.getState().cascadeSuggestion).toBeNull()
  })
})

describe('previewImport (PLAN-V2 P0.3)', () => {
  it('summarizes a valid export without touching current state', () => {
    freshTask('2026-08-01')
    const before = useAppStore.getState().tasks.length
    const file = JSON.stringify({ schemaVersion: 1, users: [{ id: 'u_1' }], tasks: [{ id: 't_1' }, { id: 't_2' }], auditLog: [] })

    const result = useAppStore.getState().previewImport(file)

    expect(result).toEqual({ ok: true, userCount: 1, taskCount: 2 })
    expect(useAppStore.getState().tasks.length).toBe(before) // untouched
  })

  it('rejects invalid JSON without touching current state', () => {
    const before = useAppStore.getState().tasks.length
    const result = useAppStore.getState().previewImport('not json')
    expect(result).toEqual({ ok: false, error: 'Not valid JSON.' })
    expect(useAppStore.getState().tasks.length).toBe(before)
  })

  it('rejects a file that does not look like a SideTrack export', () => {
    const result = useAppStore.getState().previewImport(JSON.stringify({ hello: 'world' }))
    expect(result.ok).toBe(false)
  })

  it('agrees with importJSON on what counts as valid — same acceptance, same rejection', () => {
    const validFile = JSON.stringify({ schemaVersion: 1, users: [], tasks: [], auditLog: [] })
    expect(useAppStore.getState().previewImport(validFile).ok).toBe(true)
    expect(useAppStore.getState().importJSON(validFile).ok).toBe(true)

    const invalidFile = JSON.stringify({ users: [] }) // missing schemaVersion/tasks/auditLog
    expect(useAppStore.getState().previewImport(invalidFile).ok).toBe(false)
    expect(useAppStore.getState().importJSON(invalidFile).ok).toBe(false)
  })
})

describe('exportJSON — records lastExportAt (PLAN-V2 P1)', () => {
  it('sets settings.lastExportAt as a side effect, and the returned JSON reflects it', () => {
    // Deliberately doesn't assert the "before" value is null — this store is
    // a shared singleton across the file's tests (see other tests' use of
    // deltas rather than absolute counts), so only "exportJSON moves it
    // forward" is safe to assert regardless of execution order.
    const before = useAppStore.getState().settings.lastExportAt

    const json = useAppStore.getState().exportJSON()

    const after = useAppStore.getState().settings.lastExportAt
    expect(after).not.toBeNull()
    expect(after).not.toBe(before)
    expect(JSON.parse(json).settings.lastExportAt).toBe(after)
  })
})

describe('addTask — default start date', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(localNoon(2026, 8, 10))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('does not default the start date to today when the due date is already in the past', () => {
    // Regression: the new-task form has no start-date field, so it always
    // relies on this default. A backfilled task with a past due date used to
    // get startDate = today() unconditionally, inverting the range and
    // crashing the Gantt view the moment it was opened.
    const task = useAppStore.getState().addTask({ title: 'Backfilled', assigneeId: null, dueDate: '2026-07-20' })
    expect(task.startDate).toBe('2026-07-20')
    expect(task.dueDate).toBe('2026-07-20')
  })

  it('still defaults to today when the due date is today or later', () => {
    const task = useAppStore.getState().addTask({ title: 'Future', assigneeId: null, dueDate: '2026-08-20' })
    expect(task.startDate).toBe('2026-08-10')
    expect(task.dueDate).toBe('2026-08-20')
  })
})

describe('shiftMilestone (PLAN-V2 P2.2)', () => {
  it('writes an audit entry, even with an empty reason — inline editing does not prompt for one', () => {
    const id = freshTask('2026-08-15')
    useAppStore.getState().addMilestone(id, 'Draft ready', '2026-08-01')
    const milestone = useAppStore.getState().tasks.find((t) => t.id === id)!.milestones[0]
    const before = useAppStore.getState().auditLog.length

    useAppStore.getState().shiftMilestone(id, milestone.id, '2026-08-05', '')

    const updated = useAppStore.getState().tasks.find((t) => t.id === id)!.milestones[0]
    expect(updated.dueDate).toBe('2026-08-05')
    const added = useAppStore.getState().auditLog.slice(before)
    expect(added.find((e) => e.type === 'milestone_shifted')).toBeDefined()
  })

  it('is a no-op when the date has not actually changed', () => {
    const id = freshTask('2026-08-15')
    useAppStore.getState().addMilestone(id, 'Draft ready', '2026-08-01')
    const milestone = useAppStore.getState().tasks.find((t) => t.id === id)!.milestones[0]
    const before = useAppStore.getState().auditLog.length

    useAppStore.getState().shiftMilestone(id, milestone.id, '2026-08-01', '')

    expect(useAppStore.getState().auditLog.length).toBe(before)
  })
})

describe('persistence', () => {
  it('never writes session-only fields into the exported state blob', () => {
    useAppStore.getState().addUser('Alex Chen')
    useAppStore.getState().setCurrentUser('u_whoever')
    // The adapter debounces; force the pending write out.
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        const raw = readTestStorage('sidetrack:state')
        expect(raw).not.toBeNull()
        const keys = Object.keys(JSON.parse(raw!))
        expect(keys.sort()).toEqual(['auditLog', 'schemaVersion', 'settings', 'tasks', 'users'])
        resolve()
      }, 600)
    })
  })
})

describe('setCurrentUser — the audit author must outlive a reload', () => {
  it('writes the choice to its own key, so a reload can restore who is signing edits', () => {
    const user = useAppStore.getState().addUser('Alex Chen')
    useAppStore.getState().setCurrentUser(user.id)
    // Its own key, deliberately outside `sidetrack:state`: this is a
    // per-device preference and must not travel in an export. That it stays
    // out of the state blob is asserted by the `persistence` suite above,
    // which pins the exact key list after the adapter's debounce has flushed.
    expect(readTestStorage('sidetrack:currentUser')).toBe(user.id)
  })

  it('clears the stored key when switching back to nobody', () => {
    const user = useAppStore.getState().addUser('Alex Chen')
    useAppStore.getState().setCurrentUser(user.id)
    useAppStore.getState().setCurrentUser(null)
    expect(readTestStorage('sidetrack:currentUser')).toBeNull()
  })

  it('drops the acting user on import when the incoming roster does not contain them', () => {
    const user = useAppStore.getState().addUser('Alex Chen')
    useAppStore.getState().setCurrentUser(user.id)
    expect(useAppStore.getState().currentUserId).toBe(user.id)

    const foreignBoard = JSON.stringify({
      schemaVersion: 2,
      users: [{ id: 'u_someone_else', name: 'Someone Else' }],
      tasks: [],
      auditLog: [],
      settings: { lastDigestAt: null, lastExportAt: null },
    })
    useAppStore.getState().importJSON(foreignBoard)

    expect(useAppStore.getState().currentUserId).toBeNull()
    expect(readTestStorage('sidetrack:currentUser')).toBeNull()
  })

  it('keeps the acting user on import when they do exist in the incoming roster', () => {
    const user = useAppStore.getState().addUser('Alex Chen')
    useAppStore.getState().setCurrentUser(user.id)

    const sameTeam = JSON.stringify({
      schemaVersion: 2,
      users: [{ id: user.id, name: 'Alex Chen' }],
      tasks: [],
      auditLog: [],
      settings: { lastDigestAt: null, lastExportAt: null },
    })
    useAppStore.getState().importJSON(sameTeam)

    expect(useAppStore.getState().currentUserId).toBe(user.id)
  })
})
