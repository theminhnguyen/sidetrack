import type { Task } from '../types'

/** `'unassigned'` is its own choice: "what has nobody picked up?" is a real question the Gantt filter can't ask. */
export type AssigneeFilter = 'all' | 'unassigned' | string

export interface BoardFilter {
  query: string
  assigneeId: AssigneeFilter
}

export const EMPTY_BOARD_FILTER: BoardFilter = { query: '', assigneeId: 'all' }

/**
 * Matches on the title only, deliberately. Searching descriptions too would
 * surface cards whose matching text isn't visible on them, leaving the user
 * to wonder why a result is in the list.
 */
export function matchesBoardFilter(task: Task, filter: BoardFilter): boolean {
  if (filter.assigneeId === 'unassigned') {
    if (task.assigneeId !== null) return false
  } else if (filter.assigneeId !== 'all' && task.assigneeId !== filter.assigneeId) {
    return false
  }

  const query = filter.query.trim().toLowerCase()
  if (query.length > 0 && !task.title.toLowerCase().includes(query)) return false

  return true
}

export function filterBoardTasks(tasks: Task[], filter: BoardFilter): Task[] {
  return tasks.filter((task) => matchesBoardFilter(task, filter))
}

/** Drives the "you are looking at a subset" hint — a filter left on silently is how tasks appear to vanish. */
export function isBoardFilterActive(filter: BoardFilter): boolean {
  return filter.query.trim().length > 0 || filter.assigneeId !== 'all'
}
