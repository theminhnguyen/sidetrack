import { useEffect, useState } from 'react'
import { useAppStore } from '../store/useAppStore'
import type { TaskSize, TaskStatus } from '../types'
import { Drawer } from './Drawer'
import { DependencyPicker } from './DependencyPicker'
import { AuditLog } from './AuditLog'
import { SnoozeButtons } from './SnoozeButton'
import { today } from '../lib/dates'
import { findCycle, getDirectDependents, isConflicted } from '../lib/dependencyGraph'

const SIZES: TaskSize[] = ['S', 'M', 'L', 'XL']
const STATUSES: { value: TaskStatus; label: string }[] = [
  { value: 'todo', label: 'To do' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'blocked', label: 'Blocked' },
  { value: 'done', label: 'Done' },
]

export function TaskDetailDrawer({ taskId, onClose }: { taskId: string; onClose: () => void }) {
  const task = useAppStore((s) => s.tasks.find((t) => t.id === taskId))
  const users = useAppStore((s) => s.users)
  const allTasks = useAppStore((s) => s.tasks)
  const auditLog = useAppStore((s) => s.auditLog)
  const updateTaskFields = useAppStore((s) => s.updateTaskFields)
  const setTaskStatus = useAppStore((s) => s.setTaskStatus)
  const setAssignee = useAppStore((s) => s.setAssignee)
  const setDependsOn = useAppStore((s) => s.setDependsOn)
  const deleteTask = useAppStore((s) => s.deleteTask)
  const addMilestone = useAppStore((s) => s.addMilestone)
  const toggleMilestone = useAppStore((s) => s.toggleMilestone)
  const removeMilestone = useAppStore((s) => s.removeMilestone)
  const shiftDueDate = useAppStore((s) => s.shiftDueDate)

  const [title, setTitle] = useState(task?.title ?? '')
  const [description, setDescription] = useState(task?.description ?? '')
  const [deliverable, setDeliverable] = useState(task?.deliverable ?? '')
  const [blockReason, setBlockReason] = useState<string | null>(null)
  const [draftDueDate, setDraftDueDate] = useState(task?.dueDate ?? today())
  const [dueDateReason, setDueDateReason] = useState('')
  const [newMilestoneTitle, setNewMilestoneTitle] = useState('')
  const [newMilestoneDate, setNewMilestoneDate] = useState(today())
  const [dependencyError, setDependencyError] = useState<string | null>(null)

  // Re-sync drafts only when switching tasks, not on every store update —
  // otherwise an unrelated change (e.g. toggling a milestone) would clobber
  // whatever the user is mid-typing in title/description/deliverable.
  useEffect(() => {
    if (!task) return
    setTitle(task.title)
    setDescription(task.description)
    setDeliverable(task.deliverable)
    setDraftDueDate(task.dueDate)
    setBlockReason(null)
  }, [task?.id])

  if (!task) {
    return (
      <Drawer onClose={onClose}>
        <p className="text-white/60">This task no longer exists.</p>
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

  const dueDateChanged = draftDueDate !== task.dueDate
  const tasksById = new Map(allTasks.map((t) => [t.id, t]))
  const conflicted = isConflicted(task, tasksById)
  const dependents = getDirectDependents(allTasks, task.id)

  return (
    <Drawer onClose={onClose}>
      <div className="flex items-start justify-between gap-3">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => title.trim() && title !== task.title && updateTaskFields(task.id, { title: title.trim() })}
          className="w-full bg-transparent text-xl font-semibold outline-none focus:border-b focus:border-white/30"
        />
        <button onClick={onClose} className="shrink-0 rounded-md p-1 text-white/50 hover:bg-white/10 hover:text-white">
          ✕
        </button>
      </div>

      <div className="mt-5 rounded-lg border border-emerald-500/25 bg-emerald-500/[0.06] p-3">
        <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-emerald-300/80">
          Deliverable
        </label>
        <textarea
          value={deliverable}
          onChange={(e) => setDeliverable(e.target.value)}
          onBlur={() => deliverable !== task.deliverable && updateTaskFields(task.id, { deliverable })}
          rows={2}
          placeholder="What concrete outcome does 'done' mean?"
          className="w-full resize-none bg-transparent text-sm outline-none placeholder:text-white/30"
        />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-xs text-white/50">Status</label>
          <select
            value={task.status}
            onChange={(e) => handleStatusChange(e.target.value as TaskStatus)}
            className="w-full rounded-md border border-white/15 bg-black/30 px-2 py-1.5 text-sm outline-none focus:border-white/40"
          >
            {STATUSES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
          {blockReason !== null && (
            <div className="mt-2 rounded-md border border-rose-500/30 bg-rose-500/[0.06] p-2">
              <label className="mb-1 block text-xs text-rose-300/80">Why is this blocked?</label>
              <input
                autoFocus
                value={blockReason}
                onChange={(e) => setBlockReason(e.target.value)}
                className="w-full rounded-md border border-white/15 bg-black/30 px-2 py-1 text-sm outline-none"
              />
              <div className="mt-2 flex gap-2">
                <button
                  disabled={!blockReason.trim()}
                  onClick={() => {
                    setTaskStatus(task.id, 'blocked', blockReason.trim())
                    setBlockReason(null)
                  }}
                  className="rounded-md border border-white/15 px-2 py-1 text-xs hover:bg-white/10 disabled:opacity-40"
                >
                  Confirm
                </button>
                <button
                  onClick={() => setBlockReason(null)}
                  className="rounded-md px-2 py-1 text-xs text-white/50 hover:text-white"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>

        <div>
          <label className="mb-1 block text-xs text-white/50">Assignee</label>
          <select
            value={task.assigneeId ?? ''}
            onChange={(e) => setAssignee(task.id, e.target.value || null)}
            className="w-full rounded-md border border-white/15 bg-black/30 px-2 py-1.5 text-sm outline-none focus:border-white/40"
          >
            <option value="">Unassigned</option>
            {users.filter((u) => u.active).map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-xs text-white/50">Size</label>
          <div className="flex gap-1.5">
            {SIZES.map((size) => (
              <button
                key={size}
                onClick={() => updateTaskFields(task.id, { size })}
                className={`flex-1 rounded-md border py-1 text-xs ${
                  task.size === size ? 'border-white/40 bg-white/10' : 'border-white/10 hover:bg-white/5'
                }`}
              >
                {size}
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="mb-1 flex items-center justify-between">
            <label className="text-xs text-white/50">Due date</label>
            <SnoozeButtons taskId={task.id} status={task.status} />
          </div>
          <input
            type="date"
            value={draftDueDate}
            onChange={(e) => setDraftDueDate(e.target.value)}
            className="w-full rounded-md border border-white/15 bg-black/30 px-2 py-1.5 text-sm outline-none focus:border-white/40"
          />
          {dueDateChanged && (
            <div className="mt-2 rounded-md border border-white/15 bg-white/[0.04] p-2">
              <label className="mb-1 block text-xs text-white/50">Reason for the change</label>
              <input
                autoFocus
                value={dueDateReason}
                onChange={(e) => setDueDateReason(e.target.value)}
                placeholder="e.g. Underestimated"
                className="w-full rounded-md border border-white/15 bg-black/30 px-2 py-1 text-sm outline-none"
              />
              <div className="mt-2 flex gap-2">
                <button
                  disabled={!dueDateReason.trim()}
                  onClick={() => {
                    shiftDueDate(task.id, draftDueDate, dueDateReason.trim(), 'manual')
                    setDueDateReason('')
                  }}
                  className="rounded-md border border-white/15 px-2 py-1 text-xs hover:bg-white/10 disabled:opacity-40"
                >
                  Save
                </button>
                <button
                  onClick={() => {
                    setDraftDueDate(task.dueDate)
                    setDueDateReason('')
                  }}
                  className="rounded-md px-2 py-1 text-xs text-white/50 hover:text-white"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="mt-4">
        <label className="mb-1 block text-xs text-white/50">Description</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onBlur={() => description !== task.description && updateTaskFields(task.id, { description })}
          rows={3}
          className="w-full resize-none rounded-md border border-white/15 bg-black/30 px-2 py-1.5 text-sm outline-none focus:border-white/40"
        />
      </div>

      <div className="mt-5">
        <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-white/50">Milestones</h3>
        <ul className="space-y-1.5">
          {task.milestones.map((m) => (
            <li key={m.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={m.done}
                onChange={() => toggleMilestone(task.id, m.id)}
                className="h-3.5 w-3.5"
              />
              <span className={m.done ? 'flex-1 text-white/40 line-through' : 'flex-1'}>{m.title}</span>
              <span className="text-xs text-white/40">{m.dueDate}</span>
              <button
                onClick={() => removeMilestone(task.id, m.id)}
                className="text-white/30 hover:text-rose-400"
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
            className="flex-1 rounded-md border border-white/15 bg-black/30 px-2 py-1 text-sm outline-none focus:border-white/40"
          />
          <input
            type="date"
            value={newMilestoneDate}
            onChange={(e) => setNewMilestoneDate(e.target.value)}
            className="rounded-md border border-white/15 bg-black/30 px-2 py-1 text-sm outline-none focus:border-white/40"
          />
          <button type="submit" className="rounded-md border border-white/15 px-2 text-xs hover:bg-white/10">
            Add
          </button>
        </form>
      </div>

      <div className="mt-5">
        <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-white/50">Depends on</h3>
        {conflicted && (
          <p className="mb-2 text-xs text-amber-300/90">
            ⚠️ A task this depends on finishes later than this one — timeline conflict.
          </p>
        )}
        {dependencyError && <p className="mb-2 text-xs text-rose-300/90">{dependencyError}</p>}
        <DependencyPicker
          allTasks={allTasks}
          selfId={task.id}
          value={task.dependsOn}
          onChange={handleDependsOnChange}
        />
      </div>

      <div className="mt-5">
        <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-white/50">History</h3>
        <AuditLog entries={auditLog.filter((e) => e.taskId === task.id)} users={users} task={task} />
      </div>

      <button
        onClick={() => {
          const warning =
            dependents.length > 0
              ? `${dependents.length} task(s) depend on this one and will have the dependency removed. `
              : ''
          if (window.confirm(`${warning}Delete "${task.title}"? This cannot be undone.`)) {
            deleteTask(task.id)
            onClose()
          }
        }}
        className="mt-6 text-xs text-rose-400/80 hover:text-rose-300"
      >
        Delete task
      </button>
    </Drawer>
  )
}
