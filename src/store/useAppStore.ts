import { create } from 'zustand'
import {
  type AppState,
  type AuditEventType,
  type CapacityStatus,
  type Milestone,
  type Task,
  type TaskStatus,
  type User,
  CURRENT_SCHEMA_VERSION,
  createEmptyState,
} from '../types'
import { createId } from '../lib/id'
import { addWeeksToDateOnly, nowTimestamp, today } from '../lib/dates'
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

  setCurrentUser: (userId: string | null) => void
  dismissSaveError: () => void
  dismissCascadeSuggestion: () => void
  confirmCascadeSuggestion: () => void

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
  snoozeTask: (id: string, weeks: number, reason: string, shiftOpenMilestones: boolean) => void

  exportJSON: () => string
  importJSON: (json: string) => { ok: true } | { ok: false; error: string }
  resetToSeed: () => void

  setLastDigestAt: (timestamp: string) => void
}

function persist(state: AppState) {
  localStorageAdapter.save(state)
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

  setCurrentUser: (userId) => set({ currentUserId: userId }),
  dismissSaveError: () => set({ saveError: false }),
  dismissCascadeSuggestion: () => set({ cascadeSuggestion: null }),
  confirmCascadeSuggestion: () => {
    const suggestion = get().cascadeSuggestion
    if (!suggestion) return
    const state = get()
    const shiftsByTaskId = new Map(suggestion.plan.map((s) => [s.taskId, s]))
    const auditLog = [...state.auditLog]
    const tasks = state.tasks.map((t) => {
      const shift = shiftsByTaskId.get(t.id)
      if (!shift) return t
      logEvent(auditLog, t.id, state.currentUserId, 'deadline_shifted', {
        field: 'dueDate',
        from: shift.from,
        to: shift.to,
        delta: 'cascade',
        reason: `Cascade from ${suggestion.rootTitle}`,
      })
      return { ...t, dueDate: shift.to, snoozeCount: t.snoozeCount + 1, updatedAt: nowTimestamp() }
    })
    const next = { ...state, tasks, auditLog, cascadeSuggestion: null }
    set(next)
    persist(next)
  },

  addUser: (name) => {
    const { users } = get()
    const initials = name
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map((part) => part[0])
      .join('')
      .slice(0, 2)
      .toUpperCase()
    const user: User = {
      id: createId('u'),
      name,
      initials,
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
    const users = get().users.map((u) => (u.id === id ? { ...u, name } : u))
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
    const task: Task = {
      id: createId('t'),
      title: input.title,
      description: input.description ?? '',
      deliverable: input.deliverable ?? '',
      size: input.size ?? 'M',
      status: 'todo',
      assigneeId: input.assigneeId,
      startDate: input.startDate ?? today(),
      dueDate: input.dueDate ?? today(),
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
      return {
        ...t,
        status,
        blockedReason: status === 'blocked' ? (reason ?? t.blockedReason) : null,
        completedAt: status === 'done' ? nowTimestamp() : status === t.status ? t.completedAt : null,
        updatedAt: nowTimestamp(),
      }
    })
    const auditLog = [...state.auditLog]
    logEvent(auditLog, id, state.currentUserId, 'status_changed', {
      from: task.status,
      to: status,
      reason: reason ?? null,
    })
    const next = { ...state, tasks, auditLog }
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

    const tasks = state.tasks.map((t) =>
      t.id === id
        ? { ...t, dueDate: newDate, snoozeCount: t.snoozeCount + 1, updatedAt: nowTimestamp() }
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
    const next = { ...state, tasks, auditLog }
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

    const cascadePlan = computeCascadePlan(tasks, id, weeks)
    const next = {
      ...state,
      tasks,
      auditLog,
      cascadeSuggestion:
        cascadePlan.length > 0 ? { rootTaskId: id, rootTitle: task.title, plan: cascadePlan } : state.cascadeSuggestion,
    }
    set(next)
    persist(next)
  },

  exportJSON: () => {
    const { users, tasks, auditLog, settings, schemaVersion } = get()
    return JSON.stringify({ schemaVersion, users, tasks, auditLog, settings }, null, 2)
  },

  importJSON: (json) => {
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
    const migrated = migrate(parsed)
    const next = { ...get(), ...migrated }
    set(next)
    persist(migrated)
    return { ok: true }
  },

  resetToSeed: () => {
    const seeded = seedState()
    const next = { ...get(), ...seeded }
    set(next)
    persist(seeded)
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

export function getSchemaVersion() {
  return CURRENT_SCHEMA_VERSION
}

export function emptyAppState() {
  return createEmptyState()
}
