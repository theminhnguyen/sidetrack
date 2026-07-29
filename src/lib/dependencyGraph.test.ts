import { describe, expect, it } from 'vitest'
import { computeCascadePlan, findCycle, isConflicted } from './dependencyGraph'
import { makeTask } from './testFactory'

describe('findCycle', () => {
  it('allows a simple, acyclic dependency', () => {
    const a = makeTask({ id: 'a', title: 'A' })
    const b = makeTask({ id: 'b', title: 'B', dependsOn: ['a'] })
    expect(findCycle([a, b], 'b', ['a'])).toBeNull()
  })

  it('rejects a task depending on itself', () => {
    const a = makeTask({ id: 'a', title: 'A' })
    expect(findCycle([a], 'a', ['a'])).toEqual(['A', 'A'])
  })

  it('rejects a two-step cycle and names the chain', () => {
    const a = makeTask({ id: 'a', title: 'A', dependsOn: ['b'] })
    const b = makeTask({ id: 'b', title: 'B' })
    // b currently has no deps; try to make it depend on a, which already depends on b
    expect(findCycle([a, b], 'b', ['a'])).toEqual(['B', 'A', 'B'])
  })

  it('ignores cycles elsewhere in the graph that do not involve taskId', () => {
    const a = makeTask({ id: 'a', title: 'A', dependsOn: ['b'] })
    const b = makeTask({ id: 'b', title: 'B', dependsOn: ['a'] }) // a<->b cycle, pre-existing
    const c = makeTask({ id: 'c', title: 'C' })
    // Editing c to depend on a should not be blocked by the unrelated a<->b cycle.
    expect(findCycle([a, b, c], 'c', ['a'])).toBeNull()
  })
})

describe('isConflicted', () => {
  it('is false when there are no dependencies', () => {
    const a = makeTask({ id: 'a', dependsOn: [] })
    expect(isConflicted(a, new Map([['a', a]]))).toBe(false)
  })

  it('is true when a dependency finishes later', () => {
    const dep = makeTask({ id: 'dep', dueDate: '2026-08-15' })
    const task = makeTask({ id: 'task', dueDate: '2026-08-01', dependsOn: ['dep'] })
    const byId = new Map([['dep', dep], ['task', task]])
    expect(isConflicted(task, byId)).toBe(true)
  })

  it('is true when a dependency is blocked, regardless of its date', () => {
    const dep = makeTask({ id: 'dep', dueDate: '2026-07-01', status: 'blocked' })
    const task = makeTask({ id: 'task', dueDate: '2026-08-01', dependsOn: ['dep'] })
    const byId = new Map([['dep', dep], ['task', task]])
    expect(isConflicted(task, byId)).toBe(true)
  })

  it('is false when the dependency finishes on or before the task', () => {
    const dep = makeTask({ id: 'dep', dueDate: '2026-08-01' })
    const task = makeTask({ id: 'task', dueDate: '2026-08-01', dependsOn: ['dep'] })
    const byId = new Map([['dep', dep], ['task', task]])
    expect(isConflicted(task, byId)).toBe(false)
  })
})

describe('computeCascadePlan', () => {
  it('proposes no shift when nothing depends on the root', () => {
    const a = makeTask({ id: 'a', dueDate: '2026-08-01' })
    expect(computeCascadePlan([a], 'a', 2)).toEqual([])
  })

  it('shifts a direct dependent by the same delta when it becomes conflicted', () => {
    const root = makeTask({ id: 'root', title: 'Root', dueDate: '2026-08-15' }) // already shifted
    const dependent = makeTask({ id: 'dep', title: 'Dependent', dueDate: '2026-08-10', dependsOn: ['root'] })
    const plan = computeCascadePlan([root, dependent], 'root', 2)
    expect(plan).toEqual([{ taskId: 'dep', title: 'Dependent', from: '2026-08-10', to: '2026-08-24' }])
  })

  it('does not shift a dependent that is still fine after the root moved', () => {
    const root = makeTask({ id: 'root', dueDate: '2026-08-01' })
    const dependent = makeTask({ id: 'dep', dueDate: '2026-09-01', dependsOn: ['root'] })
    expect(computeCascadePlan([root, dependent], 'root', 2)).toEqual([])
  })

  it('cascades transitively: A shifts B, which then forces C to shift too', () => {
    const a = makeTask({ id: 'a', title: 'A', dueDate: '2026-08-15' })
    const b = makeTask({ id: 'b', title: 'B', dueDate: '2026-08-10', dependsOn: ['a'] })
    const c = makeTask({ id: 'c', title: 'C', dueDate: '2026-08-20', dependsOn: ['b'] })
    const plan = computeCascadePlan([a, b, c], 'a', 2)
    expect(plan.map((s) => s.taskId)).toEqual(['b', 'c'])
    expect(plan[0]).toEqual({ taskId: 'b', title: 'B', from: '2026-08-10', to: '2026-08-24' })
    // c wasn't conflicted against b's ORIGINAL date, but is against b's shifted date.
    expect(plan[1]).toEqual({ taskId: 'c', title: 'C', from: '2026-08-20', to: '2026-09-03' })
  })
})
