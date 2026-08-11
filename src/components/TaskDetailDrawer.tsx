import { useEffect, useMemo, useState } from 'react'
import { useAppStore } from '../store/useAppStore'
import type { Milestone, TaskSize, TaskStatus } from '../types'
import { Drawer } from './Drawer'
import { Modal } from './Modal'
import { DependencyPicker } from './DependencyPicker'
import { AuditLog } from './AuditLog'
import { SnoozeButtons } from './SnoozeButton'
import { formatDateOnly, formatTimestamp, isAfterDateOnly, today } from '../lib/dates'
import { findCycle, getDirectDependents, isConflicted } from '../lib/dependencyGraph'

const SIZES: TaskSize[] = ['S', 'M', 'L', 'XL']
const STATUSES: { value: TaskStatus; label: string }[] = [
  { value: 'todo', label: 'To do' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'blocked', label: 'Blocked' },
  { value: 'done', label: 'Done' },
]

const LABEL = 'mb-1 block text-xs text-black/50 dark:text-white/50'
const INPUT =
  'w-full rounded-md border border-black/15 bg-black/[0.03] px-2 py-1.5 text-sm outline-none focus:border-black/40 dark:border-white/15 dark:bg-black/30 dark:focus:border-white/40'

export function TaskDetailDrawer({ taskId, onClose }: { taskId: string; onClose: () => void }) {
  const task = useAppStore((s) => s.tasks.find((t) => t.id === taskId))
  const users = useAppStore((s) => s.users)
  const allTasks = useAppStore((s) => s.tasks)
  // Hoisted above the `!task` early return (hooks can't follow one) — same
  // rebuilt-every-render Map that was already fixed in TaskBoard, see PLAN-V2.md P4.1.
  const tasksById = useMemo(() => new Map(allTasks.map((t) => [t.id, t])), [allTasks])
  const auditLog = useAppStore((s) => s.auditLog)
  const updateTaskFields = useAppStore((s) => s.updateTaskFields)
  const setTaskStatus = useAppStore((s) => s.setTaskStatus)
  const setAssignee = useAppStore((s) => s.setAssignee)
  const setDependsOn = useAppStore((s) => s.setDependsOn)
  const deleteTask = useAppStore((s) => s.deleteTask)
  const addMilestone = useAppStore((s) => s.addMilestone)
  const toggleMilestone = useAppStore((s) => s.toggleMilestone)
  const renameMilestone = useAppStore((s) => s.renameMilestone)
  const shiftMilestone = useAppStore((s) => s.shiftMilestone)
  const removeMilestone = useAppStore((s) => s.removeMilestone)
  const addComment = useAppStore((s) => s.addComment)
  const removeComment = useAppStore((s) => s.removeComment)
  const shiftDueDate = useAppStore((s) => s.shiftDueDate)
  const shiftStartDate = useAppStore((s) => s.shiftStartDate)

  const [title, setTitle] = useState(task?.title ?? '')
  const [description, setDescription] = useState(task?.description ?? '')
  const [deliverable, setDeliverable] = useState(task?.deliverable ?? '')
  // Autosave-on-blur is otherwise silent — a brief checkmark badge is the
  // only feedback that the edit actually landed. Each field gets its own
  // timestamp so triggering one doesn't replay another's badge.
  const [titleSavedAt, setTitleSavedAt] = useState<number | null>(null)
  const [deliverableSavedAt, setDeliverableSavedAt] = useState<number | null>(null)
  const [descriptionSavedAt, setDescriptionSavedAt] = useState<number | null>(null)
  const [blockReason, setBlockReason] = useState<string | null>(null)
  const [draftStartDate, setDraftStartDate] = useState(task?.startDate ?? today())
  const [startDateReason, setStartDateReason] = useState('')
  const [draftDueDate, setDraftDueDate] = useState(task?.dueDate ?? today())
  const [dueDateReason, setDueDateReason] = useState('')
  const [newMilestoneTitle, setNewMilestoneTitle] = useState('')
  const [newMilestoneDate, setNewMilestoneDate] = useState(today())
  const [newCommentBody, setNewCommentBody] = useState('')
  const [dependencyError, setDependencyError] = useState<string | null>(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  // Re-sync every draft when switching tasks, not on every store update —
  // otherwise an unrelated change (e.g. toggling a milestone) would clobber
  // whatever the user is mid-typing. Every piece of per-task draft state
  // needs a line here, or it leaks into the next task the drawer opens on
  // (see PLAN-V2.md P2.3 — dueDateReason and dependencyError used to be missed).
  useEffect(() => {
    if (!task) return
    setTitle(task.title)
    setDescription(task.description)
    setDeliverable(task.deliverable)
    setDraftStartDate(task.startDate)
    setStartDateReason('')
    setDraftDueDate(task.dueDate)
    setDueDateReason('')
    setBlockReason(null)
    setDependencyError(null)
    setNewMilestoneTitle('')
    setNewMilestoneDate(today())
    setNewCommentBody('')
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [task?.id])

  if (!task) {
    return (
      <Drawer onClose={onClose}>
        <p className="text-black/60 dark:text-white/60">This task no longer exists.</p>
      </Drawer>
    )
  }

  function handleStatusChange(next: TaskStatus) {
    if (!task) return
    if (next === 'blocked' && task.status !== 'blocked') {
      setBlockReason('')
      return
    }
    setBlockReason(null)
    setTaskStatus(task.id, next)
  }

  function handleDependsOnChange(next: string[]) {
    if (!task) return
    const cycle = findCycle(allTasks, task.id, next)
    if (cycle) {
      setDependencyError(`That would create a cycle: ${cycle.join(' → ')}`)
      return
    }
    setDependencyError(null)
    setDependsOn(task.id, next)
  }

  const startDateChanged = draftStartDate !== task.startDate
  const startDatePushesDueDate = startDateChanged && isAfterDateOnly(draftStartDate, task.dueDate)
  const dueDateChanged = draftDueDate !== task.dueDate
  const conflicted = isConflicted(task, tasksById)
  const dependents = getDirectDependents(allTasks, task.id)

  return (
    <Drawer onClose={onClose}>
      <div className="flex items-start justify-between gap-3">
        <div className="relative w-full">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => {
              // A task must keep a title, so an empty field snaps back to the
              // stored value instead of silently discarding the edit.
              if (!title.trim()) {
                setTitle(task.title)
                return
              }
              if (title !== task.title) {
                updateTaskFields(task.id, { title: title.trim() })
                setTitleSavedAt(Date.now())
              }
            }}
            className="w-full bg-transparent text-xl font-semibold outline-none focus:border-b focus:border-black/30 dark:focus:border-white/30"
          />
          <SavedBadge at={titleSavedAt} />
        </div>
        <button
          onClick={onClose}
          className="shrink-0 rounded-md p-1 text-black/50 hover:bg-black/5 hover:text-black dark:text-white/50 dark:hover:bg-white/10 dark:hover:text-white"
        >
          ✕
        </button>
      </div>

      <div className="relative mt-5 rounded-lg border border-emerald-500/30 bg-emerald-500/[0.06] p-3">
        <SavedBadge at={deliverableSavedAt} />
        <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-emerald-700 dark:text-emerald-300/80">
          Deliverable
        </label>
        <textarea
          value={deliverable}
          onChange={(e) => setDeliverable(e.target.value)}
          onBlur={() => {
            if (deliverable === task.deliverable) return
            updateTaskFields(task.id, { deliverable })
            setDeliverableSavedAt(Date.now())
          }}
          rows={2}
          placeholder="What concrete outcome does 'done' mean?"
          className="w-full resize-none bg-transparent text-sm outline-none placeholder:text-black/30 dark:placeholder:text-white/30"
        />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <div>
          <label className={LABEL}>Status</label>
          <select value={task.status} onChange={(e) => handleStatusChange(e.target.value as TaskStatus)} className={INPUT}>
            {STATUSES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
          {blockReason !== null && (
            <div className="mt-2 rounded-md border border-rose-500/30 bg-rose-500/[0.06] p-2">
              <label className="mb-1 block text-xs text-rose-700 dark:text-rose-300/80">Why is this blocked?</label>
              <input
                autoFocus
                value={blockReason}
                onChange={(e) => setBlockReason(e.target.value)}
                className="w-full rounded-md border border-black/15 bg-black/[0.03] px-2 py-1 text-sm outline-none dark:border-white/15 dark:bg-black/30"
              />
              <div className="mt-2 flex gap-2">
                <button
                  disabled={!blockReason.trim()}
                  onClick={() => {
                    setTaskStatus(task.id, 'blocked', blockReason.trim())
                    setBlockReason(null)
                  }}
                  className="rounded-md border border-black/15 px-2 py-1 text-xs hover:bg-black/5 disabled:opacity-40 dark:border-white/15 dark:hover:bg-white/10"
                >
                  Confirm
                </button>
                <button
                  onClick={() => setBlockReason(null)}
                  className="rounded-md px-2 py-1 text-xs text-black/50 hover:text-black dark:text-white/50 dark:hover:text-white"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>

        <div>
          <label className={LABEL}>Assignee</label>
          <select value={task.assigneeId ?? ''} onChange={(e) => setAssignee(task.id, e.target.value || null)} className={INPUT}>
            <option value="">Unassigned</option>
            {users.filter((u) => u.active).map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="mt-3">
        <label className={LABEL}>Size</label>
        <div className="flex gap-1.5">
          {SIZES.map((size) => (
            <button
              key={size}
              onClick={() => updateTaskFields(task.id, { size })}
              className={`flex-1 rounded-md border py-1 text-xs ${
                task.size === size
                  ? 'border-black/40 bg-black/5 dark:border-white/40 dark:bg-white/10'
                  : 'border-black/10 hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/5'
              }`}
            >
              {size}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3">
        <div>
          <label className={LABEL}>Start date</label>
          <input type="date" value={draftStartDate} onChange={(e) => setDraftStartDate(e.target.value)} className={INPUT} />
          {startDateChanged && (
            <div className="mt-2 rounded-md border border-black/15 bg-black/[0.03] p-2 dark:border-white/15 dark:bg-white/[0.04]">
              {startDatePushesDueDate && (
                <p className="mb-2 text-xs text-amber-700 dark:text-amber-300/90">
                  That's after the current due date — the due date will move to {formatDateOnly(draftStartDate)} too,
                  to keep the range valid.
                </p>
              )}
              <label className={LABEL}>Reason for the change</label>
              <input
                autoFocus
                value={startDateReason}
                onChange={(e) => setStartDateReason(e.target.value)}
                placeholder="e.g. Started earlier than planned"
                className="w-full rounded-md border border-black/15 bg-black/[0.03] px-2 py-1 text-sm outline-none dark:border-white/15 dark:bg-black/30"
              />
              <div className="mt-2 flex gap-2">
                <button
                  disabled={!startDateReason.trim()}
                  onClick={() => {
                    shiftStartDate(task.id, draftStartDate, startDateReason.trim())
                    setStartDateReason('')
                  }}
                  className="rounded-md border border-black/15 px-2 py-1 text-xs hover:bg-black/5 disabled:opacity-40 dark:border-white/15 dark:hover:bg-white/10"
                >
                  Save
                </button>
                <button
                  onClick={() => {
                    setDraftStartDate(task.startDate)
                    setStartDateReason('')
                  }}
                  className="rounded-md px-2 py-1 text-xs text-black/50 hover:text-black dark:text-white/50 dark:hover:text-white"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>

        <div>
          <div className="mb-1 flex items-center justify-between">
            <label className="text-xs text-black/50 dark:text-white/50">Due date</label>
            <SnoozeButtons taskId={task.id} status={task.status} />
          </div>
          <input type="date" value={draftDueDate} onChange={(e) => setDraftDueDate(e.target.value)} className={INPUT} />
          {dueDateChanged && (
            <div className="mt-2 rounded-md border border-black/15 bg-black/[0.03] p-2 dark:border-white/15 dark:bg-white/[0.04]">
              <label className={LABEL}>Reason for the change</label>
              <input
                autoFocus
                value={dueDateReason}
                onChange={(e) => setDueDateReason(e.target.value)}
                placeholder="e.g. Underestimated"
                className="w-full rounded-md border border-black/15 bg-black/[0.03] px-2 py-1 text-sm outline-none dark:border-white/15 dark:bg-black/30"
              />
              <div className="mt-2 flex gap-2">
                <button
                  disabled={!dueDateReason.trim()}
                  onClick={() => {
                    shiftDueDate(task.id, draftDueDate, dueDateReason.trim(), 'manual')
                    setDueDateReason('')
                  }}
                  className="rounded-md border border-black/15 px-2 py-1 text-xs hover:bg-black/5 disabled:opacity-40 dark:border-white/15 dark:hover:bg-white/10"
                >
                  Save
                </button>
                <button
                  onClick={() => {
                    setDraftDueDate(task.dueDate)
                    setDueDateReason('')
                  }}
                  className="rounded-md px-2 py-1 text-xs text-black/50 hover:text-black dark:text-white/50 dark:hover:text-white"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="relative mt-4">
        <SavedBadge at={descriptionSavedAt} />
        <label className={LABEL}>Description</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onBlur={() => {
            if (description === task.description) return
            updateTaskFields(task.id, { description })
            setDescriptionSavedAt(Date.now())
          }}
          rows={3}
          className={`resize-none ${INPUT}`}
        />
      </div>

      <div className="mt-5">
        <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-black/50 dark:text-white/50">Milestones</h3>
        <ul className="space-y-1.5">
          {task.milestones.map((m) => (
            <MilestoneRow
              key={m.id}
              milestone={m}
              onToggle={() => toggleMilestone(task.id, m.id)}
              onRename={(title) => renameMilestone(task.id, m.id, title)}
              onShiftDate={(newDate) => shiftMilestone(task.id, m.id, newDate, '')}
              onRemove={() => removeMilestone(task.id, m.id)}
            />
          ))}
        </ul>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (!newMilestoneTitle.trim()) return
            addMilestone(task.id, newMilestoneTitle.trim(), newMilestoneDate)
            setNewMilestoneTitle('')
          }}
          className="mt-2 flex gap-2"
        >
          <input
            value={newMilestoneTitle}
            onChange={(e) => setNewMilestoneTitle(e.target.value)}
            placeholder="New milestone…"
            className={`flex-1 ${INPUT} py-1`}
          />
          <input
            type="date"
            value={newMilestoneDate}
            onChange={(e) => setNewMilestoneDate(e.target.value)}
            className={`${INPUT} w-auto py-1`}
          />
          <button
            type="submit"
            className="rounded-md border border-black/15 px-2 text-xs hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/10"
          >
            Add
          </button>
        </form>
      </div>

      <div className="mt-5">
        <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-black/50 dark:text-white/50">Depends on</h3>
        {conflicted && (
          <p className="mb-2 text-xs text-amber-700 dark:text-amber-300/90">
            ⚠️ A task this depends on finishes later than this one — timeline conflict.
          </p>
        )}
        {dependencyError && <p className="mb-2 text-xs text-rose-600 dark:text-rose-300/90">{dependencyError}</p>}
        <DependencyPicker allTasks={allTasks} selfId={task.id} value={task.dependsOn} onChange={handleDependsOnChange} />
      </div>

      <div className="mt-5">
        <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-black/50 dark:text-white/50">Comments</h3>
        {task.comments.length === 0 ? (
          <p className="text-xs text-black/40 dark:text-white/40">No comments yet.</p>
        ) : (
          <ul className="space-y-2">
            {task.comments.map((c) => (
              <li
                key={c.id}
                className="st-pop group rounded-md border border-black/10 bg-black/[0.02] px-2.5 py-1.5 text-sm dark:border-white/10 dark:bg-white/[0.03]"
              >
                <div className="mb-0.5 flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-black/70 dark:text-white/70">
                    {users.find((u) => u.id === c.authorId)?.name ?? 'Someone'}
                  </span>
                  <span className="flex items-center gap-2 text-[11px] text-black/35 dark:text-white/35">
                    {formatTimestamp(c.createdAt)}
                    <button
                      onClick={() => removeComment(task.id, c.id)}
                      className="opacity-0 hover:text-rose-600 group-hover:opacity-100 dark:hover:text-rose-400"
                      aria-label="Delete comment"
                    >
                      ✕
                    </button>
                  </span>
                </div>
                <p className="whitespace-pre-wrap text-black/80 dark:text-white/80">{c.body}</p>
              </li>
            ))}
          </ul>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (!newCommentBody.trim()) return
            addComment(task.id, newCommentBody)
            setNewCommentBody('')
          }}
          className="mt-2 flex gap-2"
        >
          <textarea
            value={newCommentBody}
            onChange={(e) => setNewCommentBody(e.target.value)}
            placeholder="Leave a status update…"
            rows={2}
            className={`flex-1 resize-none ${INPUT}`}
          />
          <button
            type="submit"
            disabled={!newCommentBody.trim()}
            className="self-end rounded-md border border-black/15 px-2 py-1.5 text-xs hover:bg-black/5 disabled:opacity-40 dark:border-white/15 dark:hover:bg-white/10"
          >
            Comment
          </button>
        </form>
      </div>

      <div className="mt-5">
        <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-black/50 dark:text-white/50">History</h3>
        <AuditLog entries={auditLog.filter((e) => e.taskId === task.id)} users={users} task={task} />
      </div>

      <button
        onClick={() => setConfirmingDelete(true)}
        className="mt-6 text-xs text-rose-600/80 hover:text-rose-700 dark:text-rose-400/80 dark:hover:text-rose-300"
      >
        Delete task
      </button>

      {confirmingDelete && (
        <Modal title="Delete this task?" onClose={() => setConfirmingDelete(false)}>
          <p className="text-sm text-black/70 dark:text-white/70">
            {dependents.length > 0 && (
              <>
                {dependents.length} task{dependents.length === 1 ? '' : 's'} depend{dependents.length === 1 ? 's' : ''}{' '}
                on this one and will have the dependency removed.{' '}
              </>
            )}
            Delete <strong>&quot;{task.title}&quot;</strong>? This can&apos;t be undone.
          </p>
          <div className="mt-4 flex gap-2">
            <button
              onClick={() => {
                deleteTask(task.id)
                setConfirmingDelete(false)
                onClose()
              }}
              className="rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-1.5 text-sm text-rose-700 hover:bg-rose-500/20 dark:text-rose-300"
            >
              Delete
            </button>
            <button
              onClick={() => setConfirmingDelete(false)}
              className="rounded-md border border-black/15 px-3 py-1.5 text-sm hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/5"
            >
              Cancel
            </button>
          </div>
        </Modal>
      )}
    </Drawer>
  )
}

/**
 * Title is a local draft committed on blur, same reasoning as the task's own
 * title field: writing the store on every keystroke would spam re-renders
 * and, via the store's `updatedAt` bump, its own re-sync effects. Re-synced
 * from the prop (not just on mount) so a successful commit reflects the
 * trimmed value the store actually saved, not whatever whitespace was typed.
 */
function MilestoneRow({
  milestone,
  onToggle,
  onRename,
  onShiftDate,
  onRemove,
}: {
  milestone: Milestone
  onToggle: () => void
  onRename: (title: string) => void
  onShiftDate: (newDate: string) => void
  onRemove: () => void
}) {
  const [title, setTitle] = useState(milestone.title)

  useEffect(() => {
    setTitle(milestone.title)
  }, [milestone.title])

  function commit() {
    if (!title.trim()) {
      setTitle(milestone.title)
      return
    }
    onRename(title.trim())
  }

  return (
    <li className="st-pop flex items-center gap-2 text-sm">
      <MilestoneCheckbox done={milestone.done} onToggle={onToggle} label={milestone.title} />
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
        }}
        aria-label="Milestone name"
        className={`flex-1 rounded border border-transparent bg-transparent px-1 py-0.5 outline-none transition-colors duration-300 hover:border-black/15 focus:border-black/30 dark:hover:border-white/15 dark:focus:border-white/30 ${
          milestone.done ? 'text-black/40 line-through dark:text-white/40' : ''
        }`}
      />
      <input
        type="date"
        value={milestone.dueDate}
        onChange={(e) => e.target.value && onShiftDate(e.target.value)}
        aria-label={`Due date for milestone ${milestone.title}`}
        className="rounded border border-transparent bg-transparent px-1 text-xs text-black/40 outline-none hover:border-black/15 focus:border-black/30 dark:text-white/40 dark:hover:border-white/15 dark:focus:border-white/30"
      />
      <button
        onClick={onRemove}
        className="text-black/30 hover:text-rose-600 dark:text-white/30 dark:hover:text-rose-400"
        aria-label={`Remove milestone ${milestone.title}`}
      >
        ✕
      </button>
    </li>
  )
}

/**
 * A custom checkbox (not a native <input>) so the checkmark can draw itself
 * in with an SVG stroke animation on completion — a native checkbox's check
 * mark is drawn by the OS/browser and can't be animated at all.
 */
function MilestoneCheckbox({ done, onToggle, label }: { done: boolean; onToggle: () => void; label: string }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={done}
      aria-label={done ? `Mark milestone "${label}" as not done` : `Mark milestone "${label}" as done`}
      onClick={onToggle}
      className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[3px] border transition-colors duration-200 ${
        done
          ? 'border-emerald-500 bg-emerald-500'
          : 'border-black/30 hover:border-black/50 dark:border-white/30 dark:hover:border-white/50'
      }`}
    >
      {done && (
        <svg viewBox="0 0 12 12" className="h-2.5 w-2.5" aria-hidden="true">
          <path
            d="M2.5 6.3L5 8.8L9.5 3.3"
            fill="none"
            stroke="white"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            pathLength="1"
            className="st-check-draw"
          />
        </svg>
      )}
    </button>
  )
}

/**
 * Autosave-on-blur has no other feedback that an edit actually landed. `at`
 * is a fresh timestamp per save (not just a boolean) so re-mounting this via
 * `key` restarts the animation even when the same field is saved twice in a row.
 */
function SavedBadge({ at }: { at: number | null }) {
  if (at === null) return null
  return (
    <span
      key={at}
      aria-hidden="true"
      className="st-saved-badge pointer-events-none absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 text-[9px] font-bold text-white"
    >
      ✓
    </span>
  )
}
