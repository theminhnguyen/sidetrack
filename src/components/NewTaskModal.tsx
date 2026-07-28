import { useState } from 'react'
import { useAppStore } from '../store/useAppStore'
import type { TaskSize } from '../types'
import { Modal } from './Modal'
import { today } from '../lib/dates'

const SIZES: TaskSize[] = ['S', 'M', 'L', 'XL']
const LABEL = 'mb-1 block text-xs text-black/50 dark:text-white/50'
const INPUT =
  'w-full rounded-md border border-black/15 bg-black/[0.03] px-2 py-1.5 text-sm outline-none focus:border-black/40 dark:border-white/15 dark:bg-black/30 dark:focus:border-white/40'

export function NewTaskModal({ onClose, onCreated }: { onClose: () => void; onCreated: (taskId: string) => void }) {
  const allUsers = useAppStore((s) => s.users)
  const users = allUsers.filter((u) => u.active)
  const addTask = useAppStore((s) => s.addTask)

  const [title, setTitle] = useState('')
  const [assigneeId, setAssigneeId] = useState(users[0]?.id ?? '')
  const [size, setSize] = useState<TaskSize>('M')
  const [dueDate, setDueDate] = useState(today())
  const [deliverable, setDeliverable] = useState('')

  const canSubmit = title.trim().length > 0

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    const task = addTask({
      title: title.trim(),
      assigneeId: assigneeId || null,
      size,
      dueDate,
      deliverable: deliverable.trim(),
    })
    onCreated(task.id)
  }

  return (
    <Modal title="New task" onClose={onClose}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <div>
          <label className={LABEL}>Title *</label>
          <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} className={INPUT} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={LABEL}>Assignee</label>
            <select value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)} className={INPUT}>
              <option value="">Unassigned</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={LABEL}>Due date</label>
            <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={INPUT} />
          </div>
        </div>

        <div>
          <label className={LABEL}>Size</label>
          <div className="flex gap-1.5">
            {SIZES.map((s) => (
              <button
                type="button"
                key={s}
                onClick={() => setSize(s)}
                className={`flex-1 rounded-md border py-1 text-xs ${
                  size === s
                    ? 'border-black/40 bg-black/5 dark:border-white/40 dark:bg-white/10'
                    : 'border-black/10 hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/5'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className={LABEL}>Deliverable (optional)</label>
          <input
            value={deliverable}
            onChange={(e) => setDeliverable(e.target.value)}
            placeholder="What does 'done' look like?"
            className={INPUT}
          />
        </div>

        <div className="mt-2 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-3 py-1.5 text-sm text-black/60 hover:text-black dark:text-white/60 dark:hover:text-white"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!canSubmit}
            className="rounded-md border border-black/20 bg-black/5 px-3 py-1.5 text-sm hover:bg-black/10 disabled:opacity-40 dark:border-white/20 dark:bg-white/10 dark:hover:bg-white/20"
          >
            Create task
          </button>
        </div>
      </form>
    </Modal>
  )
}
