import { useEffect, useRef, useState } from 'react'
import type { Task, TaskStatus, User } from '../types'
import { formatDateOnly, isCapacityStale, isOverdue } from '../lib/dates'
import { Avatar, CapacityDot } from './Avatar'
import { SnoozeButtons } from './SnoozeButton'

const FLASH_RING: Record<TaskStatus, string> = {
  todo: 'rgba(124, 92, 255, 0.5)',
  in_progress: 'rgba(14, 165, 233, 0.5)',
  blocked: 'rgba(244, 63, 94, 0.5)',
  done: 'rgba(34, 197, 94, 0.55)',
}

/**
 * How recently a task must have changed for its card to flash on arrival.
 * A status change moves the card to a different column, which unmounts and
 * remounts it — so there is no previous status left to compare against, and
 * the freshness of `updatedAt` is what identifies a card that just moved.
 */
const FLASH_WINDOW_MS = 1500

export function TaskCard({
  task,
  assignee,
  conflicted,
  index = 0,
  allowFlash = false,
  onClick,
}: {
  task: Task
  assignee: User | undefined
  conflicted: boolean
  /** Position in its column — drives the staggered entrance. */
  index?: number
  /**
   * False on the board's very first render. Seeded tasks are all stamped with
   * the current time when the store initialises, so without this gate every
   * card would flash at once on a first visit.
   */
  allowFlash?: boolean
  onClick: () => void
}) {
  const overdue = task.status !== 'done' && isOverdue(task.dueDate)

  // Bumped to a fresh value (never just `true`) so re-adding the ring after
  // it's already been shown restarts the CSS animation instead of no-op'ing —
  // React sees the same truthy value as "nothing changed" otherwise.
  const [flashToken, setFlashToken] = useState(() =>
    allowFlash && Date.now() - Date.parse(task.updatedAt) < FLASH_WINDOW_MS ? Date.now() : null,
  )
  const isFirstRenderRef = useRef(true)
  const lastUpdatedAtRef = useRef(task.updatedAt)

  // A card that stays mounted in the same column (snoozed, edited,
  // reassigned — anything short of a status change, which remounts it via
  // the flashToken initializer above) got almost no visual acknowledgement
  // before. Any change to `updatedAt` while it's on screen re-flashes it.
  useEffect(() => {
    if (isFirstRenderRef.current) {
      isFirstRenderRef.current = false
      return
    }
    if (lastUpdatedAtRef.current === task.updatedAt) return
    lastUpdatedAtRef.current = task.updatedAt
    setFlashToken(Date.now())
  }, [task.updatedAt])

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onClick()
        }
      }}
      style={{ animationDelay: `${Math.min(index, 8) * 45}ms` }}
      className={`st-rise relative w-full cursor-pointer rounded-lg border px-4 py-3 text-left transition duration-200 hover:-translate-y-0.5 hover:border-black/25 hover:bg-black/[0.04] hover:shadow-lg dark:hover:border-white/25 dark:hover:bg-white/[0.06] ${
        conflicted
          ? 'border-amber-500/40 bg-amber-500/[0.07]'
          : 'border-black/10 bg-black/[0.015] dark:border-white/10 dark:bg-white/[0.03]'
      }`}
    >
      {flashToken !== null && (
        <span
          key={flashToken}
          aria-hidden="true"
          className="st-flash pointer-events-none absolute inset-0 rounded-lg"
          style={{ ['--st-ring' as string]: FLASH_RING[task.status] }}
        />
      )}

      <div className="flex items-start justify-between gap-3">
        <span className="font-medium leading-snug">{task.title}</span>
        <span className="shrink-0 rounded border border-black/15 px-1.5 py-0.5 text-[11px] text-black/60 dark:border-white/15 dark:text-white/60">
          {task.size}
        </span>
      </div>

      {task.status === 'blocked' && task.blockedReason && (
        <p className="mt-1 text-xs text-rose-600 dark:text-rose-300/90">🚫 {task.blockedReason}</p>
      )}
      {conflicted && (
        <p className="mt-1 text-xs text-amber-700 dark:text-amber-300/90">⚠️ Depends on a task that finishes later than this one</p>
      )}

      <div className="mt-2 flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
        <div className="flex min-w-0 items-center gap-2 text-xs text-black/50 dark:text-white/50">
          {assignee ? (
            <span className="flex min-w-0 items-center gap-1.5">
              <Avatar user={assignee} size="sm" />
              <span className="truncate text-black/70 dark:text-white/70">{assignee.name}</span>
              <CapacityDot status={assignee.capacity.status} stale={isCapacityStale(assignee.capacity.updatedAt)} />
            </span>
          ) : (
            <span className="italic">Unassigned</span>
          )}
          <span className={overdue ? 'font-medium text-rose-600 dark:text-rose-400' : ''}>
            Due {formatDateOnly(task.dueDate)}
          </span>
          {task.snoozeCount >= 2 && <span title={`Snoozed ${task.snoozeCount} times`}>⏰×{task.snoozeCount}</span>}
        </div>
        <SnoozeButtons taskId={task.id} status={task.status} />
      </div>
    </div>
  )
}
