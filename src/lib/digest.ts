import type { AppState, AuditLogEntry, Task, User } from '../types'
import { daysOverdue, formatDateOnly, formatTimestamp, isOverdue, timestampDaysAgo } from './dates'

export interface ShiftedEntry {
  task: Task
  from: string
  to: string
  reason: string
}

export interface BlockedEntry {
  task: Task
  since: string
}

export interface Digest {
  isFirstEver: boolean
  sinceTimestamp: string
  newlyDone: Task[]
  /** Not done and past their due date as of right now — a standing count, not a delta since the baseline. */
  overdue: Task[]
  blocked: BlockedEntry[]
  shifted: ShiftedEntry[]
  capacity: User[]
}

/**
 * What was this task's due date at `atTimestamp`? Reconstructed from its
 * deadline_shifted history so a snooze that later gets reverted nets out to
 * "no change" instead of being reported twice.
 */
function dueDateAt(task: Task, auditLog: AuditLogEntry[], atTimestamp: string): string | null {
  const shifts = auditLog
    .filter((e) => e.taskId === task.id && e.type === 'deadline_shifted')
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp))
  if (shifts.length === 0) return null // never shifted — current value has always been the value

  const past = shifts.filter((e) => e.timestamp <= atTimestamp)
  if (past.length > 0) {
    return past[past.length - 1].payload.to as string
  }
  return shifts[0].payload.from as string
}

function blockedSince(task: Task, auditLog: AuditLogEntry[]): string {
  const entries = auditLog
    .filter((e) => e.taskId === task.id && e.type === 'status_changed' && e.payload.to === 'blocked')
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
  return entries[0]?.timestamp ?? task.updatedAt
}

function latestShiftReason(task: Task, auditLog: AuditLogEntry[]): string {
  const entries = auditLog
    .filter((e) => e.taskId === task.id && e.type === 'deadline_shifted')
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
  return (entries[0]?.payload.reason as string) ?? ''
}

export function buildDigest(state: AppState): Digest {
  const isFirstEver = state.settings.lastDigestAt === null
  const sinceTimestamp = state.settings.lastDigestAt ?? timestampDaysAgo(7)

  const newlyDone = state.tasks.filter((t) => t.completedAt !== null && t.completedAt > sinceTimestamp)

  const overdue = state.tasks.filter((t) => t.status !== 'done' && isOverdue(t.dueDate))

  const blocked: BlockedEntry[] = state.tasks
    .filter((t) => t.status === 'blocked')
    .map((task) => ({ task, since: blockedSince(task, state.auditLog) }))

  const shifted: ShiftedEntry[] = []
  for (const task of state.tasks) {
    const before = dueDateAt(task, state.auditLog, sinceTimestamp)
    if (before !== null && before !== task.dueDate) {
      shifted.push({ task, from: before, to: task.dueDate, reason: latestShiftReason(task, state.auditLog) })
    }
  }

  const capacity = state.users.filter((u) => u.active)

  return { isFirstEver, sinceTimestamp, newlyDone, overdue, blocked, shifted, capacity }
}

const CAPACITY_ICON: Record<string, string> = { green: '🟢', yellow: '🟡', red: '🔴' }

export function formatDigestText(digest: Digest): string {
  const lines: string[] = []
  const today = formatTimestamp(new Date().toISOString())

  lines.push(`📋 SideTrack Status Update — ${today}`)
  lines.push(digest.isFirstEver ? '_First report — showing the last 7 days_' : `_Since ${formatTimestamp(digest.sinceTimestamp)}_`)
  lines.push('')

  const hasChanges =
    digest.newlyDone.length > 0 || digest.overdue.length > 0 || digest.blocked.length > 0 || digest.shifted.length > 0

  if (!hasChanges) {
    lines.push(`No changes since ${formatTimestamp(digest.sinceTimestamp)}.`)
    lines.push('')
  } else {
    if (digest.overdue.length > 0) {
      lines.push(`⚠️ Overdue (${digest.overdue.length})`)
      for (const t of digest.overdue) {
        const days = daysOverdue(t.dueDate)
        lines.push(`- ${t.title} — due ${formatDateOnly(t.dueDate)} (${days} day${days === 1 ? '' : 's'} late)`)
      }
      lines.push('')
    }

    if (digest.newlyDone.length > 0) {
      lines.push(`✅ Newly done (${digest.newlyDone.length})`)
      for (const t of digest.newlyDone) lines.push(`- ${t.title}`)
      lines.push('')
    }

    if (digest.blocked.length > 0) {
      lines.push(`🚫 Blocked (${digest.blocked.length})`)
      for (const { task, since } of digest.blocked) {
        lines.push(`- ${task.title} — ${task.blockedReason ?? 'no reason given'} (since ${formatTimestamp(since)})`)
      }
      lines.push('')
    }

    if (digest.shifted.length > 0) {
      lines.push(`📅 Shifted (${digest.shifted.length})`)
      for (const { task, from, to, reason } of digest.shifted) {
        const reasonSuffix = reason ? ` ("${reason}")` : ''
        lines.push(`- ${task.title}: ${formatDateOnly(from)} → ${formatDateOnly(to)}${reasonSuffix}`)
      }
      lines.push('')
    }
  }

  lines.push('🚦 Team capacity')
  for (const u of digest.capacity) {
    const icon = CAPACITY_ICON[u.capacity.status] ?? '⚪'
    const note = u.capacity.note ? ` — ${u.capacity.note}` : ''
    lines.push(`- ${icon} ${u.name}${note}`)
  }

  return lines.join('\n').trim()
}
