import type { Task, User } from '../types'
import { isConflicted } from './dependencyGraph'
import { isOverdue } from './dates'
import { AVATAR_PALETTE } from '../store/useAppStore'

export interface GanttFilters {
  assigneeId: string | 'all'
  hideDone: boolean
}

export interface GanttRow {
  id: string
  name: string
  start: string
  end: string
  dependencies: string
  custom_class: string
  progress: number
  /** Not a frappe-gantt field — carried through so click handlers can tell milestones from tasks. */
  kind: 'task' | 'milestone'
}

const CAPACITY_ICON: Record<string, string> = { green: '🟢', yellow: '🟡', red: '🔴' }

function paletteIndex(color: string): number {
  const i = AVATAR_PALETTE.indexOf(color)
  return i === -1 ? 0 : i
}

export function buildGanttRows(tasks: Task[], users: User[], filters: GanttFilters): GanttRow[] {
  const usersById = new Map(users.map((u) => [u.id, u]))
  const tasksById = new Map(tasks.map((t) => [t.id, t]))

  const visible = tasks.filter((t) => {
    if (filters.hideDone && t.status === 'done') return false
    if (filters.assigneeId !== 'all' && t.assigneeId !== filters.assigneeId) return false
    return true
  })
  const visibleIds = new Set(visible.map((t) => t.id))

  const sorted = [...visible].sort((a, b) => {
    const nameOf = (t: Task) => (t.assigneeId ? usersById.get(t.assigneeId)?.name ?? '' : '￿')
    const na = nameOf(a)
    const nb = nameOf(b)
    if (na !== nb) return na < nb ? -1 : 1
    return a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0
  })

  const rows: GanttRow[] = []

  for (const task of sorted) {
    const assignee = task.assigneeId ? usersById.get(task.assigneeId) : undefined
    const icon = assignee ? CAPACITY_ICON[assignee.capacity.status] ?? '⚪' : '⚪'
    // Full name, not initials: this label is also what gets rasterised into the
    // PPTX timeline slide, where no hover tooltip can rescue an abbreviation.
    const label = `${icon} ${assignee?.name ?? 'Unassigned'} · ${task.title}`

    // frappe-gantt does `classList.add(custom_class)` with the WHOLE string as
    // one token, so it must never contain spaces — encode every attribute we
    // need into a single hyphen/underscore-joined token and match substrings
    // in CSS via [class*="..."] instead of separate class selectors.
    let statusFlag = 'normal'
    if (task.status === 'done') statusFlag = 'done'
    else if (task.status === 'blocked') statusFlag = 'blocked'
    else if (isOverdue(task.dueDate)) statusFlag = 'overdue'
    else if (isConflicted(task, tasksById)) statusFlag = 'conflict'
    const assigneeSlot = assignee ? `assignee-${paletteIndex(assignee.color)}` : 'assignee-none'

    rows.push({
      id: task.id,
      name: label,
      start: task.startDate,
      end: task.dueDate,
      dependencies: task.dependsOn.filter((id) => visibleIds.has(id)).join(','),
      custom_class: `gantt-${assigneeSlot}_status-${statusFlag}`,
      progress: task.status === 'done' ? 100 : 0,
      kind: 'task',
    })

    for (const m of task.milestones) {
      rows.push({
        id: `milestone_${m.id}`,
        name: `◆ ${m.title}`,
        start: m.dueDate,
        end: m.dueDate,
        dependencies: '',
        custom_class: `gantt-milestone_${m.done ? 'done' : 'open'}`,
        progress: m.done ? 100 : 0,
        kind: 'milestone',
      })
    }
  }

  return rows
}
