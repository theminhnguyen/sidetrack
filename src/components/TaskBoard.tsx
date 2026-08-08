import { useEffect, useMemo, useRef, useState } from 'react'
import { useAppStore } from '../store/useAppStore'
import type { TaskStatus } from '../types'
import { TaskCard } from './TaskCard'
import { CountUp } from './CountUp'
import { isConflicted } from '../lib/dependencyGraph'
import { EMPTY_BOARD_FILTER, filterBoardTasks, isBoardFilterActive, type BoardFilter } from '../lib/boardFilter'

const COLUMNS: { status: TaskStatus; label: string }[] = [
  { status: 'todo', label: 'To do' },
  { status: 'in_progress', label: 'In progress' },
  { status: 'blocked', label: 'Blocked' },
  { status: 'done', label: 'Done' },
]

const CONTROL =
  'rounded-md border border-black/15 bg-black/[0.03] px-2 py-1.5 text-sm outline-none focus:border-black/40 dark:border-white/15 dark:bg-black/30 dark:focus:border-white/40'

export function TaskBoard({ onOpenTask }: { onOpenTask: (taskId: string) => void }) {
  const tasks = useAppStore((s) => s.tasks)
  const users = useAppStore((s) => s.users)
  const tasksById = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks])
  const usersById = useMemo(() => new Map(users.map((u) => [u.id, u])), [users])

  const [filter, setFilter] = useState<BoardFilter>(EMPTY_BOARD_FILTER)
  const filterActive = isBoardFilterActive(filter)
  const visibleTasks = useMemo(() => filterBoardTasks(tasks, filter), [tasks, filter])

  // Cards may only flash once the board has painted at least once, so the
  // initial set of cards arrives quietly and only later moves stand out.
  const hasRenderedRef = useRef(false)
  useEffect(() => {
    hasRenderedRef.current = true
  })

  const activeUsers = users.filter((u) => u.active)

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={filter.query}
          onChange={(e) => setFilter((f) => ({ ...f, query: e.target.value }))}
          placeholder="Search titles…"
          aria-label="Search task titles"
          className={`${CONTROL} w-48`}
        />
        <select
          value={filter.assigneeId}
          onChange={(e) => setFilter((f) => ({ ...f, assigneeId: e.target.value }))}
          aria-label="Filter by assignee"
          className={CONTROL}
        >
          <option value="all">All assignees</option>
          <option value="unassigned">Unassigned</option>
          {activeUsers.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>

        {/*
          A filter left on is how tasks appear to "disappear" — the count and
          the reset are what make a narrowed board obviously narrowed.
        */}
        {filterActive && (
          <div className="flex items-center gap-2 text-sm text-black/60 dark:text-white/60">
            <span>
              Showing {visibleTasks.length} of {tasks.length}
            </span>
            <button
              onClick={() => setFilter(EMPTY_BOARD_FILTER)}
              className="rounded-md border border-black/15 px-2 py-1 text-xs hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/5"
            >
              Clear filter
            </button>
          </div>
        )}
      </div>

      {filterActive && visibleTasks.length === 0 && (
        <p className="st-fade rounded-lg border border-dashed border-black/15 px-3 py-8 text-center text-sm text-black/50 dark:border-white/15 dark:text-white/50">
          No tasks match this filter.
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {COLUMNS.map((col) => {
          const columnTasks = visibleTasks.filter((t) => t.status === col.status)
          return (
            <div key={col.status}>
              <h3 className="mb-2 flex items-center gap-2 text-sm font-medium uppercase tracking-wide text-black/50 dark:text-white/50">
                {col.label}
                {/* Counts follow the filter — a "To do 5" above one visible card would read as a bug. */}
                <CountUp
                  value={columnTasks.length}
                  className="rounded-full bg-black/10 px-1.5 text-xs text-black/60 dark:bg-white/10 dark:text-white/60"
                />
              </h3>
              <div className="space-y-2">
                {columnTasks.length === 0 && !filterActive && (
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
    </div>
  )
}
