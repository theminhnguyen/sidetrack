import type { Task, User } from '../types'
import { formatDateOnly, isOverdue } from '../lib/dates'
import { Avatar, CapacityDot } from './Avatar'

export function TaskCard({
  task,
  assignee,
  onClick,
}: {
  task: Task
  assignee: User | undefined
  onClick: () => void
}) {
  const overdue = task.status !== 'done' && isOverdue(task.dueDate)

  return (
    <button
      onClick={onClick}
      className="w-full rounded-lg border border-white/10 bg-white/[0.03] px-4 py-3 text-left hover:border-white/25 hover:bg-white/[0.06]"
    >
      <div className="flex items-start justify-between gap-3">
        <span className="font-medium leading-snug">{task.title}</span>
        <span className="shrink-0 rounded border border-white/15 px-1.5 py-0.5 text-[11px] text-white/60">
          {task.size}
        </span>
      </div>

      {task.status === 'blocked' && task.blockedReason && (
        <p className="mt-1 text-xs text-rose-300/90">🚫 {task.blockedReason}</p>
      )}

      <div className="mt-2 flex items-center gap-2 text-xs text-white/50">
        {assignee ? (
          <span className="flex items-center gap-1.5">
            <Avatar user={assignee} size="sm" />
            <CapacityDot status={assignee.capacity.status} />
          </span>
        ) : (
          <span className="italic">Unassigned</span>
        )}
        <span className={overdue ? 'font-medium text-rose-400' : ''}>
          Due {formatDateOnly(task.dueDate)}
        </span>
        {task.snoozeCount >= 2 && <span title={`Snoozed ${task.snoozeCount} times`}>⏰×{task.snoozeCount}</span>}
      </div>
    </button>
  )
}
