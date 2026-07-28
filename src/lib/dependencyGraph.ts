import type { Task } from '../types'
import { addWeeksToDateOnly, isAfterDateOnly } from './dates'

/**
 * Would setting `taskId`'s dependencies to `candidateDependsOn` create a cycle?
 * Returns the offending chain of task titles (e.g. ["A", "B", "A"]) if so,
 * otherwise null. Checked against a graph where every OTHER task keeps its
 * current dependsOn, and only `taskId` uses the candidate list.
 */
export function findCycle(
  tasks: Task[],
  taskId: string,
  candidateDependsOn: string[],
): string[] | null {
  const byId = new Map(tasks.map((t) => [t.id, t]))
  const edgesOf = (id: string): string[] => (id === taskId ? candidateDependsOn : byId.get(id)?.dependsOn ?? [])

  const path: string[] = []
  const onPath = new Set<string>()

  function dfs(id: string): string[] | null {
    if (id === taskId && path.length > 0) return [...path, id]
    if (onPath.has(id)) return null // cycle elsewhere in the graph, not through taskId
    onPath.add(id)
    path.push(id)
    for (const next of edgesOf(id)) {
      const found = dfs(next)
      if (found) return found
    }
    path.pop()
    onPath.delete(id)
    return null
  }

  const cycleIds = dfs(taskId)
  if (!cycleIds) return null
  return cycleIds.map((id) => byId.get(id)?.title ?? id)
}

/** A task depending on a blocked task, or on one that finishes after it, is in conflict. */
export function isConflicted(task: Task, tasksById: Map<string, Task>): boolean {
  return task.dependsOn.some((depId) => {
    const dep = tasksById.get(depId)
    if (!dep) return false
    return dep.status === 'blocked' || isAfterDateOnly(dep.dueDate, task.dueDate)
  })
}

export function getDirectDependents(tasks: Task[], taskId: string): Task[] {
  return tasks.filter((t) => t.dependsOn.includes(taskId))
}

export interface CascadeShift {
  taskId: string
  title: string
  from: string
  to: string
}

/**
 * After `rootId`'s due date has already moved, find every dependent task
 * that is now in conflict as a result (directly or transitively), and the
 * date each of them would need to move to in lockstep. Pure — does not
 * mutate anything; the caller decides whether to apply the plan.
 */
export function computeCascadePlan(tasks: Task[], rootId: string, deltaWeeks: number): CascadeShift[] {
  const byId = new Map(tasks.map((t) => [t.id, t]))
  const effectiveDueDate = new Map<string, string>()
  const plan: CascadeShift[] = []
  const queue: string[] = [rootId]
  const queued = new Set<string>([rootId])

  while (queue.length > 0) {
    const currentId = queue.shift()!
    for (const dependent of getDirectDependents(tasks, currentId)) {
      if (queued.has(dependent.id)) continue

      const dependentDueDate = effectiveDueDate.get(dependent.id) ?? dependent.dueDate
      const conflicted = dependent.dependsOn.some((depId) => {
        const dep = byId.get(depId)
        if (!dep) return false
        const depDueDate = effectiveDueDate.get(depId) ?? dep.dueDate
        return dep.status === 'blocked' || isAfterDateOnly(depDueDate, dependentDueDate)
      })

      if (conflicted) {
        const to = addWeeksToDateOnly(dependentDueDate, deltaWeeks)
        plan.push({ taskId: dependent.id, title: dependent.title, from: dependentDueDate, to })
        effectiveDueDate.set(dependent.id, to)
        queued.add(dependent.id)
        queue.push(dependent.id)
      }
    }
  }

  return plan
}
