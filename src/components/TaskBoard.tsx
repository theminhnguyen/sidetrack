import { useAppStore } from '../store/useAppStore'
import type { TaskStatus } from '../types'
import { TaskCard } from './TaskCard'
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
  const tasksById = new Map(tasks.map((t) => [t.id, t]))

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
      {COLUMNS.map((col) => {
        const columnTasks = tasks.filter((t) => t.status === col.status)
        return (
          <div key={col.status}>
            <h3 className="mb-2 flex items-center gap-2 text-sm font-medium uppercase tracking-wide text-black/50 dark:text-white/50">
              {col.label}
              <span className="rounded-full bg-black/10 px-1.5 text-xs text-black/60 dark:bg-white/10 dark:text-white/60">
                {columnTasks.length}
              </span>
            </h3>
            <div className="space-y-2">
              {columnTasks.length === 0 && (
                <p className="rounded-lg border border-dashed border-black/10 px-3 py-4 text-center text-xs text-black/30 dark:border-white/10 dark:text-white/30">
                  Nothing here
                </p>
              )}
              {columnTasks.map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  assignee={users.find((u) => u.id === task.assigneeId)}
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
