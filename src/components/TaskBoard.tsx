import { useAppStore } from '../store/useAppStore'
import type { TaskStatus } from '../types'
import { TaskCard } from './TaskCard'

const COLUMNS: { status: TaskStatus; label: string }[] = [
  { status: 'todo', label: 'To do' },
  { status: 'in_progress', label: 'In progress' },
  { status: 'blocked', label: 'Blocked' },
  { status: 'done', label: 'Done' },
]

export function TaskBoard({ onOpenTask }: { onOpenTask: (taskId: string) => void }) {
  const tasks = useAppStore((s) => s.tasks)
  const users = useAppStore((s) => s.users)

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
      {COLUMNS.map((col) => {
        const columnTasks = tasks.filter((t) => t.status === col.status)
        return (
          <div key={col.status}>
            <h3 className="mb-2 flex items-center gap-2 text-sm font-medium uppercase tracking-wide text-white/50">
              {col.label}
              <span className="rounded-full bg-white/10 px-1.5 text-xs text-white/60">
                {columnTasks.length}
              </span>
            </h3>
            <div className="space-y-2">
              {columnTasks.length === 0 && (
                <p className="rounded-lg border border-dashed border-white/10 px-3 py-4 text-center text-xs text-white/30">
                  Nothing here
                </p>
              )}
              {columnTasks.map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  assignee={users.find((u) => u.id === task.assigneeId)}
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
