import { useEffect, useMemo, useRef, useState } from 'react'
import Gantt from 'frappe-gantt'
// Vendored copy — frappe-gantt's package.json "exports" map doesn't expose
// ./dist/frappe-gantt.css as an importable subpath, so bundlers reject it directly.
import '../styles/frappe-gantt.css'
import { useAppStore } from '../store/useAppStore'
import { buildGanttRows, type GanttFilters, type GanttRow } from '../lib/ganttAdapter'
import { toDateOnly } from '../lib/dates'
import { Modal } from './Modal'

const VIEW_MODES = ['Day', 'Week', 'Month'] as const
type ViewMode = (typeof VIEW_MODES)[number]

interface DragChange {
  taskId: string
  taskTitle: string
  newStart: string
  newEnd: string
}

const QUICK_REASONS = ['Day job', 'Waiting on others', 'Underestimated']

function findMilestoneOwner(tasks: ReturnType<typeof useAppStore.getState>['tasks'], milestoneRowId: string) {
  const milestoneId = milestoneRowId.replace('milestone_', '')
  return tasks.find((t) => t.milestones.some((m) => m.id === milestoneId))
}

export function GanttChart({ onOpenTask }: { onOpenTask: (taskId: string) => void }) {
  const tasks = useAppStore((s) => s.tasks)
  const users = useAppStore((s) => s.users)
  const shiftDueDate = useAppStore((s) => s.shiftDueDate)
  const updateTaskFields = useAppStore((s) => s.updateTaskFields)

  const containerRef = useRef<HTMLDivElement>(null)
  const ganttRef = useRef<Gantt | null>(null)
  const rowsRef = useRef<GanttRow[]>([])

  const [assigneeId, setAssigneeId] = useState<string>('all')
  const [hideDone, setHideDone] = useState(false)
  const [viewMode, setViewMode] = useState<ViewMode>('Week')
  const [dragChange, setDragChange] = useState<DragChange | null>(null)
  const [dragReason, setDragReason] = useState('')

  const filters: GanttFilters = useMemo(() => ({ assigneeId, hideDone }), [assigneeId, hideDone])
  const rows = useMemo(() => buildGanttRows(tasks, users, filters), [tasks, users, filters])

  useEffect(() => {
    rowsRef.current = rows
  }, [rows])

  // Create the chart once real data exists; afterwards it's kept in sync via
  // refresh() in the effect below. onOpenTask (a useState setter) and the
  // initial viewMode are intentionally captured once — view mode changes are
  // applied imperatively via change_view_mode, not by recreating the chart.
  useEffect(() => {
    if (!containerRef.current || ganttRef.current || rows.length === 0) return

    ganttRef.current = new Gantt(containerRef.current, rows, {
      view_mode: viewMode,
      view_mode_select: false,
      on_click: (ganttTask: { id: string }) => {
        if (ganttTask.id.startsWith('milestone_')) {
          const owner = findMilestoneOwner(useAppStore.getState().tasks, ganttTask.id)
          if (owner) onOpenTask(owner.id)
          return
        }
        onOpenTask(ganttTask.id)
      },
      on_date_change: (ganttTask: { id: string }, start: Date, end: Date) => {
        if (ganttTask.id.startsWith('milestone_')) {
          // Milestones aren't draggable in this view — snap back to the stored data.
          ganttRef.current?.refresh(rowsRef.current)
          return
        }
        const task = useAppStore.getState().tasks.find((t) => t.id === ganttTask.id)
        if (!task) return
        const newStart = toDateOnly(start)
        const newEnd = toDateOnly(end)
        if (newStart === task.startDate && newEnd === task.dueDate) return
        setDragChange({ taskId: task.id, taskTitle: task.title, newStart, newEnd })
      },
    })
  }, [rows])

  // Keep an existing chart's data in sync with the store/filters.
  useEffect(() => {
    if (ganttRef.current) ganttRef.current.refresh(rows)
  }, [rows])

  useEffect(() => {
    if (ganttRef.current) ganttRef.current.change_view_mode(viewMode)
  }, [viewMode])

  function cancelDragChange() {
    setDragChange(null)
    setDragReason('')
    ganttRef.current?.refresh(rowsRef.current)
  }

  function confirmDragChange() {
    if (!dragChange) return
    const task = useAppStore.getState().tasks.find((t) => t.id === dragChange.taskId)
    if (task && dragChange.newStart !== task.startDate) {
      updateTaskFields(dragChange.taskId, { startDate: dragChange.newStart })
    }
    if (task && dragChange.newEnd !== task.dueDate) {
      shiftDueDate(dragChange.taskId, dragChange.newEnd, dragReason.trim(), 'manual')
    }
    setDragChange(null)
    setDragReason('')
  }

  const activeUsers = users.filter((u) => u.active)

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <select
          value={assigneeId}
          onChange={(e) => setAssigneeId(e.target.value)}
          className="rounded-md border border-black/15 bg-black/[0.03] px-2 py-1.5 text-sm outline-none focus:border-black/40 dark:border-white/15 dark:bg-black/30 dark:focus:border-white/40"
        >
          <option value="all">All assignees</option>
          {activeUsers.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 text-sm text-black/60 dark:text-white/60">
          <input type="checkbox" checked={hideDone} onChange={(e) => setHideDone(e.target.checked)} className="h-3.5 w-3.5" />
          Hide done
        </label>
        <div className="ml-auto flex gap-1.5">
          {VIEW_MODES.map((mode) => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className={`rounded-md border px-2.5 py-1 text-xs ${
                viewMode === mode
                  ? 'border-black/40 bg-black/5 dark:border-white/40 dark:bg-white/10'
                  : 'border-black/15 hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/5'
              }`}
            >
              {mode}
            </button>
          ))}
        </div>
      </div>

      <div className={rows.length === 0 ? 'hidden' : 'gantt-shell overflow-x-auto rounded-lg border border-black/10 dark:border-white/10'}>
        <div ref={containerRef} />
      </div>
      {rows.length === 0 && (
        <p className="rounded-lg border border-dashed border-black/10 px-3 py-10 text-center text-sm text-black/40 dark:border-white/10 dark:text-white/40">
          No tasks match these filters.
        </p>
      )}

      {dragChange && (
        <Modal title="Why is this moving?" onClose={cancelDragChange}>
          <p className="mb-3 text-sm text-black/70 dark:text-white/70">
            <strong>{dragChange.taskTitle}</strong> now runs {dragChange.newStart} → {dragChange.newEnd}.
          </p>
          <div className="mb-2 flex flex-wrap gap-1.5">
            {QUICK_REASONS.map((r) => (
              <button
                key={r}
                onClick={() => setDragReason(r)}
                className={`rounded-full border px-2 py-1 text-xs ${
                  dragReason === r
                    ? 'border-black/40 bg-black/5 dark:border-white/40 dark:bg-white/10'
                    : 'border-black/15 hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/5'
                }`}
              >
                {r}
              </button>
            ))}
          </div>
          <input
            autoFocus
            value={dragReason}
            onChange={(e) => setDragReason(e.target.value)}
            placeholder="Or type a reason…"
            className="w-full rounded-md border border-black/15 bg-black/[0.03] px-2 py-1.5 text-sm outline-none focus:border-black/40 dark:border-white/15 dark:bg-black/30 dark:focus:border-white/40"
          />
          <div className="mt-4 flex justify-end gap-2">
            <button onClick={cancelDragChange} className="rounded-md px-3 py-1.5 text-sm text-black/60 hover:text-black dark:text-white/60 dark:hover:text-white">
              Cancel
            </button>
            <button
              disabled={!dragReason.trim()}
              onClick={confirmDragChange}
              className="rounded-md border border-black/20 bg-black/5 px-3 py-1.5 text-sm hover:bg-black/10 disabled:opacity-40 dark:border-white/20 dark:bg-white/10 dark:hover:bg-white/20"
            >
              Save
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}
