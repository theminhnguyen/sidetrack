import type { AuditLogEntry, Task, User } from '../types'
import { formatDateOnly } from './dates'

const STATUS_LABEL: Record<string, string> = {
  todo: 'To do',
  in_progress: 'In progress',
  blocked: 'Blocked',
  done: 'Done',
}

function nameOf(userId: string | null | undefined, users: User[]): string {
  if (!userId) return 'Unassigned'
  return users.find((u) => u.id === userId)?.name ?? 'Someone'
}

function actorOf(entry: AuditLogEntry, users: User[]): string {
  return entry.actorId ? nameOf(entry.actorId, users) : 'Someone'
}

export function formatAuditEntry(entry: AuditLogEntry, users: User[], task?: Task): string {
  const who = actorOf(entry, users)
  const p = entry.payload as Record<string, unknown>

  switch (entry.type) {
    case 'task_created':
      return `${who} created this task`

    case 'status_changed': {
      const from = STATUS_LABEL[p.from as string] ?? String(p.from)
      const to = STATUS_LABEL[p.to as string] ?? String(p.to)
      const reason = p.reason as string | null
      return reason
        ? `${who} changed status from ${from} to ${to} — "${reason}"`
        : `${who} changed status from ${from} to ${to}`
    }

    case 'deadline_shifted': {
      const from = formatDateOnly(p.from as string)
      const to = formatDateOnly(p.to as string)
      const delta = p.delta as string
      const reason = p.reason as string
      const deltaLabel = delta === 'manual' || delta === 'cascade' ? '' : ` (${delta})`
      const what = p.field === 'startDate' ? 'the start date' : 'the deadline'
      return `${who} moved ${what} from ${from} to ${to}${deltaLabel} — "${reason}"`
    }

    case 'milestone_shifted': {
      const title = task?.milestones.find((m) => m.id === p.milestoneId)?.title ?? 'a milestone'
      const from = formatDateOnly(p.from as string)
      const to = formatDateOnly(p.to as string)
      const reason = p.reason as string
      // Reason is optional here (unlike a task's own deadline) — editing a
      // milestone's date inline doesn't prompt for one, see PLAN-V2.md P2.2.
      return reason
        ? `${who} moved milestone "${title}" from ${from} to ${to} — "${reason}"`
        : `${who} moved milestone "${title}" from ${from} to ${to}`
    }

    case 'assignee_changed': {
      const from = nameOf(p.from as string | null, users)
      const to = nameOf(p.to as string | null, users)
      return `${who} reassigned this task from ${from} to ${to}`
    }

    case 'capacity_changed': {
      const to = STATUS_LABEL[p.to as string] ?? String(p.to)
      return `${who} set their capacity to ${to}`
    }

    default:
      return `${who} updated this task`
  }
}
