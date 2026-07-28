import type { AuditLogEntry, Task, User } from '../types'
import { formatAuditEntry } from '../lib/auditFormat'
import { formatTimestamp } from '../lib/dates'

export function AuditLog({
  entries,
  users,
  task,
}: {
  entries: AuditLogEntry[]
  users: User[]
  task: Task
}) {
  const sorted = [...entries].sort((a, b) => b.timestamp.localeCompare(a.timestamp))

  if (sorted.length === 0) {
    return <p className="text-xs text-black/40 dark:text-white/40">No history yet.</p>
  }

  return (
    <ul className="space-y-2">
      {sorted.map((entry) => (
        <li key={entry.id} className="text-xs text-black/60 dark:text-white/60">
          <span className="text-black/35 dark:text-white/35">{formatTimestamp(entry.timestamp)}</span>{' '}
          {formatAuditEntry(entry, users, task)}
        </li>
      ))}
    </ul>
  )
}
