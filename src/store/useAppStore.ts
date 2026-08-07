import { create } from 'zustand'
import {
  type AppState,
  type AuditEventType,
  type CapacityStatus,
  type Milestone,
  type Task,
  type TaskStatus,
  type User,
} from '../types'
import { createId } from '../lib/id'
import { addWeeksToDateOnly, isAfterDateOnly, isBeforeDateOnly, nowTimestamp, today } from '../lib/dates'
import { localStorageAdapter } from '../storage/localStorageAdapter'
import { migrate } from '../storage/StorageAdapter'
import { seedState } from '../data/seed'
import { computeCascadePlan, type CascadeShift } from '../lib/dependencyGraph'

export const AVATAR_PALETTE = [
  '#7C5CFF', '#22c55e', '#0ea5e9', '#f97316', '#ec4899',
  '#eab308', '#14b8a6', '#a855f7', '#ef4444', '#84cc16',
]

interface NewTaskInput {
  title: string
  assigneeId: string | null
  description?: string
  deliverable?: string
  size?: Task['size']
  startDate?: string
  dueDate?: string
  dependsOn?: string[]
}

export interface CascadeSuggestion {
  rootTaskId: string
  rootTitle: string
  plan: CascadeShift[]
}

interface AppStore extends AppState {
  currentUserId: string | null
  saveError: boolean
  cascadeSuggestion: CascadeSuggestion | null
  /** Set when confirming a cascade applied fewer shifts than shown — see confirmCascadeSuggestion. */
  cascadeAppliedNote: string | null
  /** Set when a task crosses into `done`, so the UI can celebrate it once. */
  celebration: { taskId: string; at: number } | null

  setCurrentUser: (userId: string | null) => void
  dismissSaveError: () => void
  dismissCascadeSuggestion: () => void
  confirmCascadeSuggestion: () => void
  dismissCascadeAppliedNote: () => void
  clearCelebration: () => void

  addUser: (name: string) => User
  renameUser: (id: string, name: string) => void
  setCapacity: (userId: string, status: CapacityStatus, note?: string | null) => void
  setUserActive: (id: string, active: boolean) => void

  addTask: (input: NewTaskInput) => Task
  updateTaskFields: (
    id: string,
    patch: Partial<Pick<Task, 'title' | 'description' | 'deliverable' | 'size' | 'startDate'>>,
  ) => void
  setTaskStatus: (id: string, status: TaskStatus, reason?: string) => void
  setAssignee: (id: string, assigneeId: string | null) => void
  setDependsOn: (id: string, dependsOn: string[]) => void
  deleteTask: (id: string) => void

  addMilestone: (taskId: string, title: string, dueDate: string) => void
  toggleMilestone: (taskId: string, milestoneId: string) => void
  shiftMilestone: (taskId: string, milestoneId: string, newDate: string, reason: string) => void
  removeMilestone: (taskId: string, milestoneId: string) => void

  shiftDueDate: (
    id: string,
    newDate: string,
    reason: string,
    delta: string,
  ) => void
  shiftStartDate: (id: string, newDate: string, reason: string) => void
  snoozeTask: (id: string, weeks: number, reason: string, shiftOpenMilestones: boolean) => void

  exportJSON: () => string
  /** Validates and summarizes a would-be import without touching any state — lets the UI ask "replace N tasks with M?" before committing. */
  previewImport: (json: string) => { ok: true; userCount: number; taskCount: number } | { ok: false; error: string }
  importJSON: (json: string) => { ok: true } | { ok: false; error: string }

  setLastDigestAt: (timestamp: string) => void
}

/**
 * Persist only the AppState slice. `get()` also carries session-only fields
 * (currentUserId, saveError, cascadeSuggestion, celebration) and the action
 * functions, none of which belong in storage — a persisted `saveError: true`,
 * a stale cascade suggestion, or a replayed celebration would otherwise be one
 * reordered line away from resurfacing on load.
 */
function persist(state: AppState) {
  localStorageAdapter.save({
    schemaVersion: state.schemaVersion,
    users: state.users,
    tasks: state.tasks,
    auditLog: state.auditLog,
    settings: state.settings,
  })
}

function deriveInitials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

function logEvent(
  auditLog: AppState['auditLog'],
  taskId: string | null,
  actorId: string | null,
  type: AuditEventType,
  payload: Record<string, unknown>,
) {
  auditLog.push({
    id: createId('log'),
    taskId,
    timestamp: nowTimestamp(),
    actorId,
    type,
    payload,
  })
}

/**
 * Shared by previewImport and importJSON so the two can never disagree about
 * what counts as a valid export — a file the preview accepted but the
 * commit step rejected (or vice versa) would be its own kind of data-loss bug.
 */
function parseImportCandidate(json: string): { ok: true; parsed: Partial<AppState> } | { ok: false; error: string } {
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    return { ok: false, error: 'Not valid JSON.' }
  }
  const candidate = parsed as Partial<AppState>
  if (
    !parsed ||
    typeof parsed !== 'object' ||
    typeof candidate.schemaVersion !== 'number' ||
    !Array.isArray(candidate.users) ||
    !Array.isArray(candidate.tasks) ||
    !Array.isArray(candidate.auditLog)
  ) {
    return { ok: false, error: 'This does not look like a SideTrack export.' }
  }
  return { ok: true, parsed: candidate }
}

function loadInitialState(): AppState {
  const stored = localStorageAdapter.load()
  if (stored.users.length === 0 && stored.tasks.length === 0) {
    return seedState()
  }
  return stored
}

export const useAppStore = create<AppStore>((set, get) => ({
  ...loadInitialState(),
  currentUserId: null,
  saveError: false,
  cascadeSuggestion: null,
  cascadeAppliedNote: null,
  celebration: null,

  setCurrentUser: (userId) => set({ currentUserId: userId }),
  dismissSaveError: () => set({ saveError: false }),
  dismissCascadeSuggestion: () => set({ cascadeSuggestion: null }),
  dismissCascadeAppliedNote: () => set({ cascadeAppliedNote: null }),
  clearCelebration: () => set({ celebration: null }),
  confirmCascadeSuggestion: () => {
    const suggestion = get().cascadeSuggestion
    if (!suggestion) return
    const state = get()
    const shiftsByTaskId = new Map(suggestion.plan.map((s) => [s.taskId, s]))
    const auditLog = [...state.auditLog]
    let droppedCount = 0
    const tasks = state.tasks.map((t) => {
      const shift = shiftsByTaskId.get(t.id)
      if (!shift) return t
      // The plan was computed when the toast first appeared. If this task's
      // due date no longer matches what the plan assumed, something else
      // changed it in the meantime — applying `shift.to` now would both
      // clobber that newer value and log a "from" the task never actually had.
      if (shift.from !== t.dueDate) {
        droppedCount++
        return t
      }
      logEvent(auditLog, t.id, state.currentUserId, 'deadline_shifted', {
        field: 'dueDate',
        from: shift.from,
        to: shift.to,
        delta: 'cascade',
        reason: `Cascade from ${suggestion.rootTitle}`,
      })
      return { ...t, dueDate: shift.to, snoozeCount: t.snoozeCount + 1, updatedAt: nowTimestamp() }
    })
    const cascadeAppliedNote =
      droppedCount > 0
        ? `${droppedCount} of ${suggestion.plan.length} task(s) had already changed since this suggestion appeared and were not moved.`
        : null
    const next = { ...state, tasks, auditLog, cascadeSuggestion: null, cascadeAppliedNote }
    set(next)
    persist(next)
  },

  addUser: (name) => {
    const { users } = get()
    const user: User = {
      id: createId('u'),
      name,
      initials: deriveInitials(name),
      color: AVATAR_PALETTE[users.length % AVATAR_PALETTE.length],
      capacity: { status: 'green', note: null, updatedAt: nowTimestamp() },
      active: true,
    }
    const next = { ...get(), users: [...users, user] }
    set(next)
    persist(next)
    return user
  },

  renameUser: (id, name) => {
    // Initials are derived from the name, so they have to move with it.
    const users = get().users.map((u) => (u.id === id ? { ...u, name, initials: deriveInitials(name) } : u))
    const next = { ...get(), users }
    set(next)
    persist(next)
  },

  setCapacity: (userId, status, note = null) => {
    const state = get()
    const users = state.users.map((u) =>
      u.id === userId ? { ...u, capacity: { status, note, updatedAt: nowTimestamp() } } : u,
    )
    const auditLog = [...state.auditLog]
    const prev = state.users.find((u) => u.id === userId)
    logEvent(auditLog, null, userId, 'capacity_changed', {
      from: prev?.capacity.status ?? null,
      to: status,
      note,
    })
    const next = { ...state, users, auditLog }
    set(next)
    persist(next)
  },

  setUserActive: (id, active) => {
    const users = get().users.map((u) => (u.id === id ? { ...u, active } : u))
    const next = { ...get(), users }
    set(next)
    persist(next)
  },

  addTask: (input) => {
    const state = get()
    const now = nowTimestamp()
    const dueDate = input.dueDate ?? today()
    // The new-task form has no start-date field, so it always defaults here.
    // Defaulting unconditionally to today() would put the start after the due
    // date for any task backfilled with a past deadline — an inverted range
    // that crashes the Gantt view (frappe-gantt assumes start <= end).
    const startDate = input.startDate ?? (isBeforeDateOnly(dueDate, today()) ? dueDate : today())
    const task: Task = {
      id: createId('t'),
      title: input.title,
      description: input.description ?? '',
      deliverable: input.deliverable ?? '',
      size: input.size ?? 'M',
      status: 'todo',
      assigneeId: input.assigneeId,
      startDate,
      dueDate,
      completedAt: null,
      milestones: [],
      dependsOn: input.dependsOn ?? [],
      blockedReason: null,
      snoozeCount: 0,
      createdAt: now,
      updatedAt: now,
    }
    const auditLog = [...state.auditLog]
    logEvent(auditLog, task.id, state.currentUserId, 'task_created', {})
    const next = { ...state, tasks: [...state.tasks, task], auditLog }
    set(next)
    persist(next)
    return task
  },

  updateTaskFields: (id, patch) => {
    const state = get()
    const tasks = state.tasks.map((t) =>
      t.id === id ? { ...t, ...patch, updatedAt: nowTimestamp() } : t,
    )
    const next = { ...state, tasks }
    set(next)
    persist(next)
  },

  setTaskStatus: (id, status, reason) => {
    const state = get()
    const task = state.tasks.find((t) => t.id === id)
    if (!task) return

    const tasks = state.tasks.map((t) => {
      if (t.id !== id) return t
      // Re-marking an already-done task must keep the original completedAt,
      // otherwise it would resurface in the next digest as "newly done".
      // Leaving `done` clears it so a reopened task doesn't ghost through either.
      let completedAt = t.completedAt
      if (status === 'done') completedAt = t.completedAt ?? nowTimestamp()
      else if (status !== t.status) completedAt = null

      return {
        ...t,
        status,
        blockedReason: status === 'blocked' ? (reason ?? t.blockedReason) : null,
        completedAt,
        updatedAt: nowTimestamp(),
      }
    })
    const auditLog = [...state.auditLog]
    logEvent(auditLog, id, state.currentUserId, 'status_changed', {
      from: task.status,
      to: status,
      reason: reason ?? null,
    })
    // Only a genuine crossing into `done` celebrates — re-applying `done` to an
    // already-finished task shouldn't fire confetti a second time.
    const justCompleted = status === 'done' && task.status !== 'done'
    const next = {
      ...state,
      tasks,
      auditLog,
      celebration: justCompleted ? { taskId: id, at: Date.now() } : state.celebration,
    }
    set(next)
    persist(next)
  },

  setAssignee: (id, assigneeId) => {
    const state = get()
    const task = state.tasks.find((t) => t.id === id)
    if (!task) return
    const tasks = state.tasks.map((t) =>
      t.id === id ? { ...t, assigneeId, updatedAt: nowTimestamp() } : t,
    )
    const auditLog = [...state.auditLog]
    logEvent(auditLog, id, state.currentUserId, 'assignee_changed', {
      from: task.assigneeId,
      to: assigneeId,
    })
    const next = { ...state, tasks, auditLog }
    set(next)
    persist(next)
  },

  setDependsOn: (id, dependsOn) => {
    const tasks = get().tasks.map((t) => (t.id === id ? { ...t, dependsOn, updatedAt: nowTimestamp() } : t))
    const next = { ...get(), tasks }
    set(next)
    persist(next)
  },

  deleteTask: (id) => {
    const state = get()
    const tasks = state.tasks
      .filter((t) => t.id !== id)
      .map((t) => ({ ...t, dependsOn: t.dependsOn.filter((dep) => dep !== id) }))
    const next = { ...state, tasks }
    set(next)
    persist(next)
  },

  addMilestone: (taskId, title, dueDate) => {
    const milestone: Milestone = { id: createId('m'), title, dueDate, done: false }
    const tasks = get().tasks.map((t) =>
      t.id === taskId ? { ...t, milestones: [...t.milestones, milestone], updatedAt: nowTimestamp() } : t,
    )
    const next = { ...get(), tasks }
    set(next)
    persist(next)
  },

  toggleMilestone: (taskId, milestoneId) => {
    const tasks = get().tasks.map((t) => {
      if (t.id !== taskId) return t
      return {
        ...t,
        milestones: t.milestones.map((m) => (m.id === milestoneId ? { ...m, done: !m.done } : m)),
        updatedAt: nowTimestamp(),
      }
    })
    const next = { ...get(), tasks }
    set(next)
    persist(next)
  },

  shiftMilestone: (taskId, milestoneId, newDate, reason) => {
    const state = get()
    const task = state.tasks.find((t) => t.id === taskId)
    const milestone = task?.milestones.find((m) => m.id === milestoneId)
    if (!task || !milestone) return

    const tasks = state.tasks.map((t) => {
      if (t.id !== taskId) return t
      return {
        ...t,
        milestones: t.milestones.map((m) => (m.id === milestoneId ? { ...m, dueDate: newDate } : m)),
        updatedAt: nowTimestamp(),
      }
    })
    const auditLog = [...state.auditLog]
    logEvent(auditLog, taskId, state.currentUserId, 'milestone_shifted', {
      milestoneId,
      from: milestone.dueDate,
      to: newDate,
      reason,
    })
    const next = { ...state, tasks, auditLog }
    set(next)
    persist(next)
  },

  removeMilestone: (taskId, milestoneId) => {
    const tasks = get().tasks.map((t) =>
      t.id === taskId
        ? { ...t, milestones: t.milestones.filter((m) => m.id !== milestoneId), updatedAt: nowTimestamp() }
        : t,
    )
    const next = { ...get(), tasks }
    set(next)
    persist(next)
  },

  shiftDueDate: (id, newDate, reason, delta) => {
    const state = get()
    const task = state.tasks.find((t) => t.id === id)
    if (!task) return

    // snoozeCount drives the "this keeps slipping" badge, so only a later date
    // counts — pulling a deadline forward is the opposite of a slip.
    const slipped = isAfterDateOnly(newDate, task.dueDate)
    // A due date pulled earlier than the task's own start would invert the
    // range and crash the Gantt view (frappe-gantt assumes start <= end) —
    // bring the start along with it instead of letting that happen.
    const startDate = isBeforeDateOnly(newDate, task.startDate) ? newDate : task.startDate
    const tasks = state.tasks.map((t) =>
      t.id === id
        ? {
            ...t,
            startDate,
            dueDate: newDate,
            snoozeCount: slipped ? t.snoozeCount + 1 : t.snoozeCount,
            updatedAt: nowTimestamp(),
          }
        : t,
    )
    const auditLog = [...state.auditLog]
    logEvent(auditLog, id, state.currentUserId, 'deadline_shifted', {
      field: 'dueDate',
      from: task.dueDate,
      to: newDate,
      delta,
      reason,
    })
    // A suggestion computed before this shift may no longer reflect reality —
    // it should never outlive the action that could invalidate it. This path
    // doesn't recompute a cascade of its own, so the only valid outcome is `null`.
    const next = { ...state, tasks, auditLog, cascadeSuggestion: null }
    set(next)
    persist(next)
  },

  shiftStartDate: (id, newDate, reason) => {
    const state = get()
    const task = state.tasks.find((t) => t.id === id)
    if (!task || task.startDate === newDate) return

    // A start dragged past the task's own due date would invert the range and
    // crash the Gantt view — bring the due date along with it instead.
    const dueDate = isAfterDateOnly(newDate, task.dueDate) ? newDate : task.dueDate
    const tasks = state.tasks.map((t) =>
      t.id === id ? { ...t, startDate: newDate, dueDate, updatedAt: nowTimestamp() } : t,
    )
    const auditLog = [...state.auditLog]
    logEvent(auditLog, id, state.currentUserId, 'deadline_shifted', {
      field: 'startDate',
      from: task.startDate,
      to: newDate,
      delta: 'manual',
      reason,
    })
    const next = { ...state, tasks, auditLog, cascadeSuggestion: null }
    set(next)
    persist(next)
  },

  snoozeTask: (id, weeks, reason, shiftOpenMilestones) => {
    const state = get()
    const task = state.tasks.find((t) => t.id === id)
    if (!task) return

    const newDueDate = addWeeksToDateOnly(task.dueDate, weeks)
    const deltaLabel = `${weeks > 0 ? '+' : ''}${weeks}w`

    const tasks = state.tasks.map((t) => {
      if (t.id !== id) return t
      const milestones = shiftOpenMilestones
        ? t.milestones.map((m) => (m.done ? m : { ...m, dueDate: addWeeksToDateOnly(m.dueDate, weeks) }))
        : t.milestones
      return { ...t, dueDate: newDueDate, snoozeCount: t.snoozeCount + 1, milestones, updatedAt: nowTimestamp() }
    })

    const auditLog = [...state.auditLog]
    logEvent(auditLog, id, state.currentUserId, 'deadline_shifted', {
      field: 'dueDate',
      from: task.dueDate,
      to: newDueDate,
      delta: deltaLabel,
      reason,
    })
    if (shiftOpenMilestones) {
      for (const m of task.milestones) {
        if (m.done) continue
        logEvent(auditLog, id, state.currentUserId, 'milestone_shifted', {
          milestoneId: m.id,
          from: m.dueDate,
          to: addWeeksToDateOnly(m.dueDate, weeks),
          reason: 'Shifted along with the task snooze',
        })
      }
    }

    // Always replace, never keep a leftover suggestion from an earlier,
    // unrelated snooze — a suggestion must never outlive the action that
    // produced it (see PLAN-V2.md P0.2).
    const cascadePlan = computeCascadePlan(tasks, id, weeks)
    const next = {
      ...state,
      tasks,
      auditLog,
      cascadeSuggestion: cascadePlan.length > 0 ? { rootTaskId: id, rootTitle: task.title, plan: cascadePlan } : null,
    }
    set(next)
    persist(next)
  },

  exportJSON: () => {
    // Recorded so the UI can nudge "you haven't backed up in a while" — the
    // only way to know a real export happened, not just that the button exists.
    const state = get()
    const settings = { ...state.settings, lastExportAt: nowTimestamp() }
    const next = { ...state, settings }
    set(next)
    persist(next)
    return JSON.stringify(
      { schemaVersion: next.schemaVersion, users: next.users, tasks: next.tasks, auditLog: next.auditLog, settings: next.settings },
      null,
      2,
    )
  },

  previewImport: (json) => {
    const result = parseImportCandidate(json)
    if (!result.ok) return result
    return { ok: true, userCount: result.parsed.users!.length, taskCount: result.parsed.tasks!.length }
  },

  importJSON: (json) => {
    const result = parseImportCandidate(json)
    if (!result.ok) return result
    const migrated = migrate(result.parsed)
    const next = { ...get(), ...migrated }
    set(next)
    persist(migrated)
    return { ok: true }
  },

  setLastDigestAt: (timestamp) => {
    const state = get()
    const settings = { ...state.settings, lastDigestAt: timestamp }
    const next = { ...state, settings }
    set(next)
    persist(next)
  },
}))

localStorageAdapter.setSaveFailureListener(() => {
  useAppStore.setState({ saveError: true })
})
