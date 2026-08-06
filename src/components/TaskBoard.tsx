import { useEffect, useMemo, useRef } from 'react'
import { useAppStore } from '../store/useAppStore'
import type { TaskStatus } from '../types'
import { TaskCard } from './TaskCard'
import { CountUp } from './CountUp'
import { isConflicted } from '../lib/dependencyGraph'

const COLUMNS: { status: TaskStatus; label: string }[] = [
  { status: 'todo', label: 'To do' },
  { status: 'in_progress', label: 'In progress' },
  { status: 'blocked', label: 'Blocked' },
  { status: 'done', label: 'Done' },
]

export function TaskBoard({ onOpenTask }: { onOpenTask: (taskId: string) => void }) {
  const tasks = useAppStore((s) => s.tasks)
  const users = useAppStore((s) => s.users)
  const tasksById = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks])
  const usersById = useMemo(() => new Map(users.map((u) => [u.id, u])), [users])

  // Cards may only flash once the board has painted at least once, so the
  // initial set of cards arrives quietly and only later moves stand out.
  const hasRenderedRef = useRef(false)
  useEffect(() => {
    hasRenderedRef.current = true
  })

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
      {COLUMNS.map((col) => {
        const columnTasks = tasks.filter((t) => t.status === col.status)
        return (
          <div key={col.status}>
            <h3 className="mb-2 flex items-center gap-2 text-sm font-medium uppercase tracking-wide text-black/50 dark:text-white/50">
              {col.label}
              <CountUp
                value={columnTasks.length}
                className="rounded-full bg-black/10 px-1.5 text-xs text-black/60 dark:bg-white/10 dark:text-white/60"
              />
            </h3>
            <div className="space-y-2">
              {columnTasks.length === 0 && (
                <p className="st-fade rounded-lg border border-dashed border-black/10 px-3 py-4 text-center text-xs text-black/30 dark:border-white/10 dark:text-white/30">
                  Nothing here
                </p>
              )}
              {columnTasks.map((task, i) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  index={i}
                  allowFlash={hasRenderedRef.current}
                  assignee={task.assigneeId ? usersById.get(task.assigneeId) : undefined}
                  conflicted={task.status !== 'done' && isConflicted(task, tasksById)}
                  onClick={() => onOpenTask(task.id)}
                />
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
