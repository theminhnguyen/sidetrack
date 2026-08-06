import { beforeEach, describe, expect, it } from 'vitest'
import { useAppStore } from './useAppStore'
import { readTestStorage, resetTestStorage } from '../test/setup'

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
})

describe('persistence', () => {
  it('never writes session-only fields into storage', () => {
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
