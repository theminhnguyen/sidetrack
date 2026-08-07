import { useEffect, useMemo, useState } from 'react'
import { useAppStore } from '../store/useAppStore'
import type { TaskSize, TaskStatus } from '../types'
import { Drawer } from './Drawer'
import { Modal } from './Modal'
import { DependencyPicker } from './DependencyPicker'
import { AuditLog } from './AuditLog'
import { SnoozeButtons } from './SnoozeButton'
import { formatDateOnly, isAfterDateOnly, today } from '../lib/dates'
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
  const shiftMilestone = useAppStore((s) => s.shiftMilestone)
  const removeMilestone = useAppStore((s) => s.removeMilestone)
  const shiftDueDate = useAppStore((s) => s.shiftDueDate)
  const shiftStartDate = useAppStore((s) => s.shiftStartDate)

  const [title, setTitle] = useState(task?.title ?? '')
  const [description, setDescription] = useState(task?.description ?? '')
  const [deliverable, setDeliverable] = useState(task?.deliverable ?? '')
  const [blockReason, setBlockReason] = useState<string | null>(null)
  const [draftStartDate, setDraftStartDate] = useState(task?.startDate ?? today())
  const [startDateReason, setStartDateReason] = useState('')
  const [draftDueDate, setDraftDueDate] = useState(task?.dueDate ?? today())
  const [dueDateReason, setDueDateReason] = useState('')
  const [newMilestoneTitle, setNewMilestoneTitle] = useState('')
  const [newMilestoneDate, setNewMilestoneDate] = useState(today())
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
            if (title !== task.title) updateTaskFields(task.id, { title: title.trim() })
          }}
          className="w-full bg-transparent text-xl font-semibold outline-none focus:border-b focus:border-black/30 dark:focus:border-white/30"
        />
        <button
          onClick={onClose}
          className="shrink-0 rounded-md p-1 text-black/50 hover:bg-black/5 hover:text-black dark:text-white/50 dark:hover:bg-white/10 dark:hover:text-white"
        >
          ✕
        </button>
      </div>

      <div className="mt-5 rounded-lg border border-emerald-500/30 bg-emerald-500/[0.06] p-3">
        <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-emerald-700 dark:text-emerald-300/80">
          Deliverable
        </label>
        <textarea
          value={deliverable}
          onChange={(e) => setDeliverable(e.target.value)}
          onBlur={() => deliverable !== task.deliverable && updateTaskFields(task.id, { deliverable })}
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

      <div className="mt-4">
        <label className={LABEL}>Description</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onBlur={() => description !== task.description && updateTaskFields(task.id, { description })}
          rows={3}
          className={`resize-none ${INPUT}`}
        />
      </div>

      <div className="mt-5">
        <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-black/50 dark:text-white/50">Milestones</h3>
        <ul className="space-y-1.5">
          {task.milestones.map((m) => (
            <li key={m.id} className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={m.done} onChange={() => toggleMilestone(task.id, m.id)} className="h-3.5 w-3.5" />
              <span className={m.done ? 'flex-1 text-black/40 line-through dark:text-white/40' : 'flex-1'}>{m.title}</span>
              <input
                type="date"
                value={m.dueDate}
                onChange={(e) => e.target.value && shiftMilestone(task.id, m.id, e.target.value, '')}
                aria-label={`Due date for milestone ${m.title}`}
                className="rounded border border-transparent bg-transparent px-1 text-xs text-black/40 outline-none hover:border-black/15 focus:border-black/30 dark:text-white/40 dark:hover:border-white/15 dark:focus:border-white/30"
              />
              <button
                onClick={() => removeMilestone(task.id, m.id)}
                className="text-black/30 hover:text-rose-600 dark:text-white/30 dark:hover:text-rose-400"
                aria-label={`Remove milestone ${m.title}`}
              >
                ✕
              </button>
            </li>
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
