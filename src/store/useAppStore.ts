import { create } from 'zustand'
import {
  type AppState,
  type AuditEventType,
  type CapacityStatus,
  type Comment,
  type Milestone,
  type Task,
  type TaskStatus,
  type User,
} from '../types'
import { createId } from '../lib/id'
import { addWeeksToDateOnly, isAfterDateOnly, isBeforeDateOnly, nowTimestamp, today } from '../lib/dates'
import { loadCurrentUserId, resolveCurrentUserId, saveCurrentUserId } from '../lib/currentUser'
import { localStorageAdapter } from '../storage/localStorageAdapter'
import { migrate } from '../storage/StorageAdapter'
import { seedState } from '../data/seed'
import { computeCascadePlan, type CascadeShift } from '../lib/dependencyGraph'
import {
  SharedFileSync,
  clearStoredHandle,
  getStoredHandle,
  isFileSystemAccessSupported,
  pickExistingFile,
  pickNewFile,
  storeHandle,
  verifyPermission,
} from '../lib/sharedFile'

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

export type SharedFileStatus =
  | 'unsupported' // browser has no File System Access API (Firefox/Safari)
  | 'disconnected'
  | 'needs-reconnect' // a remembered handle exists but permission needs a fresh click to re-grant
  | 'connecting'
  | 'connected'
  | 'conflict' // a push found the file changed underneath it; needs a user decision
  | 'error'

export interface SharedFileState {
  status: SharedFileStatus
  name: string | null
  error: string | null
  /** Only set while status is 'connecting' for the "join an existing file" flow — the count preview shown before replacing local data. */
  connectPreview: { userCount: number; taskCount: number } | null
}

const INITIAL_SHARED_FILE_STATE: SharedFileState = {
  status: isFileSystemAccessSupported() ? 'disconnected' : 'unsupported',
  name: null,
  error: null,
  connectPreview: null,
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

  addMilestone: (taskId: string, title: string, dueDate: string) => Milestone
  toggleMilestone: (taskId: string, milestoneId: string) => void
  renameMilestone: (taskId: string, milestoneId: string, title: string) => void
  shiftMilestone: (taskId: string, milestoneId: string, newDate: string, reason: string) => void
  removeMilestone: (taskId: string, milestoneId: string) => void

  addComment: (taskId: string, body: string) => void
  removeComment: (taskId: string, commentId: string) => void

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

  sharedFile: SharedFileState
  /** Opens the "pick an existing file" dialog and, if it looks like a SideTrack file, stages it behind connectPreview for confirmation. */
  connectSharedFile: () => Promise<void>
  /** Same staging flow, but for a handle obtained by dropping a file onto the page (DataTransferItem.getAsFileSystemHandle). */
  connectSharedFileFromHandle: (handle: FileSystemFileHandle) => Promise<void>
  confirmConnectSharedFile: () => Promise<void>
  cancelConnectSharedFile: () => void
  /** For the first person setting one up — seeds the picked file with the current board. */
  createSharedFile: () => Promise<void>
  disconnectSharedFile: () => Promise<void>
  /** Re-grants permission on a remembered handle from a previous session — must run from a click, not on boot. */
  reconnectSharedFile: () => Promise<void>
  syncSharedFileNow: () => Promise<void>
  dismissSharedFileError: () => void
  /** Conflict resolution: force-write the local board over whatever a teammate just saved. */
  keepMyVersionInConflict: () => Promise<void>
  /** Conflict resolution: discard local changes since the last sync and adopt the file's current content. */
  takeTheirVersionInConflict: () => void
  /** Used internally by the sharedFile sync wiring at the bottom of this module — not normally called from UI. */
  applySharedFileText: (text: string) => void
}

/**
 * Persist only the AppState slice. `get()` also carries session-only fields
 * (currentUserId, saveError, cascadeSuggestion, celebration) and the action
 * functions, none of which belong in storage — a persisted `saveError: true`,
 * a stale cascade suggestion, or a replayed celebration would otherwise be one
 * reordered line away from resurfacing on load.
 */
function serializeState(state: AppState): string {
  return JSON.stringify(
    { schemaVersion: state.schemaVersion, users: state.users, tasks: state.tasks, auditLog: state.auditLog, settings: state.settings },
    null,
    2,
  )
}

// Set for the duration of applying a state that came FROM the shared file
// (a pull, or a conflict resolution that adopts the remote side) — persist()
// checks it to skip pushing that same content straight back, which would
// otherwise be a pointless round-trip on every successful sync.
let applyingRemoteState = false

function persist(state: AppState) {
  localStorageAdapter.save({
    schemaVersion: state.schemaVersion,
    users: state.users,
    tasks: state.tasks,
    auditLog: state.auditLog,
    settings: state.settings,
  })
  if (!applyingRemoteState) sharedFileSync.push(serializeState(state))
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

/** Applies an already-migrated state as the new board — shared by importJSON and every shared-file sync path. */
function applyImportedState(migrated: AppState) {
  // An incoming roster may not include whoever you were signing as. Keeping
  // the old id would attribute every later edit to a teammate this board
  // (now) has never heard of.
  const currentUserId = resolveCurrentUserId(useAppStore.getState().currentUserId, migrated.users)
  saveCurrentUserId(currentUserId)
  useAppStore.setState({ ...migrated, currentUserId })
  persist(migrated)
}

/** Validates and applies JSON that came FROM the shared file (pull, reconnect, or "take theirs"). Returns whether it was applied. */
function applyRemoteText(text: string): boolean {
  const result = parseImportCandidate(text)
  if (!result.ok) return false
  applyingRemoteState = true
  try {
    applyImportedState(migrate(result.parsed))
  } finally {
    applyingRemoteState = false
  }
  return true
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong.'
}

function patchSharedFile(patch: Partial<SharedFileState>) {
  useAppStore.setState((state) => ({ sharedFile: { ...state.sharedFile, ...patch } }))
}

// Handle + text staged by connectSharedFile() while the user confirms
// replacing local data, and the remote text staged by a detected conflict —
// kept out of the reactive store since neither needs to drive a render
// beyond the small summaries already in SharedFileState.
let pendingConnect: { handle: FileSystemFileHandle; text: string } | null = null
let pendingConflictText: string | null = null

/**
 * Permission-checks a handle, reads it, and stages it behind connectPreview
 * for the user to confirm — shared by the file picker and the drag-and-drop
 * path so the two can never disagree about what "connecting" means (in
 * particular: neither ever replaces local data without confirmation).
 * Must run from a user gesture, since it may request permission.
 */
async function stageConnect(handle: FileSystemFileHandle) {
  const granted = await verifyPermission(handle, 'readwrite', true)
  if (!granted) {
    patchSharedFile({ status: 'disconnected', error: 'Permission was not granted for that file.' })
    return
  }
  let text: string
  try {
    text = await handle.getFile().then((f) => f.text())
  } catch (error) {
    patchSharedFile({ status: 'error', error: describeError(error) })
    return
  }
  const result = parseImportCandidate(text)
  if (!result.ok) {
    patchSharedFile({ status: 'error', error: "That file doesn't look like a SideTrack export." })
    return
  }
  // Staged, not applied yet — confirmConnectSharedFile() is what actually
  // replaces local data, once the UI has shown the user what that means.
  pendingConnect = { handle, text }
  patchSharedFile({
    status: 'connecting',
    name: handle.name,
    connectPreview: { userCount: result.parsed.users!.length, taskCount: result.parsed.tasks!.length },
  })
}

async function attemptReconnect(handle: FileSystemFileHandle, requestPermissionIfNeeded: boolean) {
  const granted = await verifyPermission(handle, 'readwrite', requestPermissionIfNeeded)
  if (!granted) {
    patchSharedFile({ status: 'needs-reconnect', name: handle.name })
    return
  }
  try {
    const text = await sharedFileSync.attach(handle)
    applyRemoteText(text)
    sharedFileSync.startPolling()
    patchSharedFile({ status: 'connected', name: handle.name, error: null })
  } catch (error) {
    patchSharedFile({ status: 'error', error: describeError(error) })
  }
}

function loadInitialState(): AppState {
  const stored = localStorageAdapter.load()
  if (stored.users.length > 0 || stored.tasks.length > 0) return stored

  // Commit the seed straight away. Left unsaved it was regenerated on every
  // load — with freshly minted ids each time — so anything holding an id
  // across a reload silently dangled. The "acting as" choice was the first
  // casualty: it stored a perfectly valid id that no longer matched anyone.
  const seeded = seedState()
  localStorageAdapter.save(seeded)
  return seeded
}

const initialState = loadInitialState()

export const useAppStore = create<AppStore>((set, get) => ({
  ...initialState,
  // Restored from its own storage key, then checked against the roster that
  // actually loaded — a stored id pointing at a since-removed teammate must
  // not silently keep signing audit entries.
  currentUserId: resolveCurrentUserId(loadCurrentUserId(), initialState.users),
  saveError: false,
  cascadeSuggestion: null,
  cascadeAppliedNote: null,
  celebration: null,
  sharedFile: INITIAL_SHARED_FILE_STATE,

  setCurrentUser: (userId) => {
    saveCurrentUserId(userId)
    set({ currentUserId: userId })
  },
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
      comments: [],
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
    const state = get()
    const tasks = state.tasks.map((t) =>
      t.id === taskId ? { ...t, milestones: [...t.milestones, milestone], updatedAt: nowTimestamp() } : t,
    )
    const auditLog = [...state.auditLog]
    logEvent(auditLog, taskId, state.currentUserId, 'milestone_added', { title })
    const next = { ...state, tasks, auditLog }
    set(next)
    persist(next)
    return milestone
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

  renameMilestone: (taskId, milestoneId, title) => {
    const state = get()
    const task = state.tasks.find((t) => t.id === taskId)
    const milestone = task?.milestones.find((m) => m.id === milestoneId)
    if (!task || !milestone || !title.trim() || milestone.title === title) return

    const tasks = state.tasks.map((t) => {
      if (t.id !== taskId) return t
      return {
        ...t,
        milestones: t.milestones.map((m) => (m.id === milestoneId ? { ...m, title } : m)),
        updatedAt: nowTimestamp(),
      }
    })
    const next = { ...state, tasks }
    set(next)
    persist(next)
  },

  shiftMilestone: (taskId, milestoneId, newDate, reason) => {
    const state = get()
    const task = state.tasks.find((t) => t.id === taskId)
    const milestone = task?.milestones.find((m) => m.id === milestoneId)
    if (!task || !milestone || milestone.dueDate === newDate) return

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
    const state = get()
    const task = state.tasks.find((t) => t.id === taskId)
    const milestone = task?.milestones.find((m) => m.id === milestoneId)
    const tasks = state.tasks.map((t) =>
      t.id === taskId
        ? { ...t, milestones: t.milestones.filter((m) => m.id !== milestoneId), updatedAt: nowTimestamp() }
        : t,
    )
    const auditLog = [...state.auditLog]
    if (milestone) logEvent(auditLog, taskId, state.currentUserId, 'milestone_removed', { title: milestone.title })
    const next = { ...state, tasks, auditLog }
    set(next)
    persist(next)
  },

  addComment: (taskId, body) => {
    const trimmed = body.trim()
    if (!trimmed) return
    const state = get()
    const comment: Comment = { id: createId('c'), body: trimmed, authorId: state.currentUserId, createdAt: nowTimestamp() }
    const tasks = state.tasks.map((t) =>
      t.id === taskId ? { ...t, comments: [...t.comments, comment], updatedAt: nowTimestamp() } : t,
    )
    const next = { ...state, tasks }
    set(next)
    persist(next)
  },

  removeComment: (taskId, commentId) => {
    const state = get()
    const tasks = state.tasks.map((t) =>
      t.id === taskId ? { ...t, comments: t.comments.filter((c) => c.id !== commentId), updatedAt: nowTimestamp() } : t,
    )
    const next = { ...state, tasks }
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
    return serializeState(next)
  },

  previewImport: (json) => {
    const result = parseImportCandidate(json)
    if (!result.ok) return result
    return { ok: true, userCount: result.parsed.users!.length, taskCount: result.parsed.tasks!.length }
  },

  importJSON: (json) => {
    const result = parseImportCandidate(json)
    if (!result.ok) return result
    applyImportedState(migrate(result.parsed))
    return { ok: true }
  },

  setLastDigestAt: (timestamp) => {
    const state = get()
    const settings = { ...state.settings, lastDigestAt: timestamp }
    const next = { ...state, settings }
    set(next)
    persist(next)
  },

  connectSharedFile: async () => {
    patchSharedFile({ status: 'connecting', error: null, connectPreview: null })
    let handle: FileSystemFileHandle
    try {
      handle = await pickExistingFile()
    } catch (error) {
      patchSharedFile({
        status: isAbortError(error) ? 'disconnected' : 'error',
        error: isAbortError(error) ? null : describeError(error),
      })
      return
    }
    await stageConnect(handle)
  },

  connectSharedFileFromHandle: async (handle) => {
    patchSharedFile({ status: 'connecting', error: null, connectPreview: null })
    await stageConnect(handle)
  },

  confirmConnectSharedFile: async () => {
    const pending = pendingConnect
    pendingConnect = null
    if (!pending) return
    const applied = applyRemoteText(pending.text)
    if (!applied) {
      patchSharedFile({ status: 'error', error: "That file doesn't look like a SideTrack export.", connectPreview: null })
      return
    }
    try {
      await sharedFileSync.attach(pending.handle)
    } catch (error) {
      patchSharedFile({ status: 'error', error: describeError(error), connectPreview: null })
      return
    }
    sharedFileSync.startPolling()
    void storeHandle(pending.handle)
    patchSharedFile({ status: 'connected', name: pending.handle.name, connectPreview: null, error: null })
  },

  cancelConnectSharedFile: () => {
    pendingConnect = null
    patchSharedFile({ status: 'disconnected', name: null, connectPreview: null, error: null })
  },

  createSharedFile: async () => {
    patchSharedFile({ status: 'connecting', error: null })
    let handle: FileSystemFileHandle
    try {
      handle = await pickNewFile()
    } catch (error) {
      patchSharedFile({
        status: isAbortError(error) ? 'disconnected' : 'error',
        error: isAbortError(error) ? null : describeError(error),
      })
      return
    }
    const granted = await verifyPermission(handle, 'readwrite', true)
    if (!granted) {
      patchSharedFile({ status: 'disconnected', error: 'Permission was not granted for that file.' })
      return
    }
    try {
      await sharedFileSync.attach(handle)
      await sharedFileSync.forcePush(serializeState(get()))
    } catch (error) {
      sharedFileSync.detach()
      patchSharedFile({ status: 'error', error: describeError(error) })
      return
    }
    sharedFileSync.startPolling()
    void storeHandle(handle)
    patchSharedFile({ status: 'connected', name: handle.name, error: null })
  },

  disconnectSharedFile: async () => {
    sharedFileSync.detach()
    pendingConnect = null
    pendingConflictText = null
    await clearStoredHandle()
    patchSharedFile({ status: 'disconnected', name: null, error: null, connectPreview: null })
  },

  reconnectSharedFile: async () => {
    const handle = await getStoredHandle()
    if (!handle) {
      patchSharedFile({ status: 'disconnected' })
      return
    }
    patchSharedFile({ status: 'connecting', error: null })
    await attemptReconnect(handle, true)
  },

  syncSharedFileNow: async () => {
    await sharedFileSync.pullNow()
  },

  dismissSharedFileError: () => {
    patchSharedFile({ error: null, status: sharedFileSync.isConnected ? 'connected' : 'disconnected' })
  },

  keepMyVersionInConflict: async () => {
    pendingConflictText = null
    await sharedFileSync.forcePush(serializeState(get()))
    patchSharedFile({ status: 'connected', error: null })
  },

  takeTheirVersionInConflict: () => {
    const text = pendingConflictText
    pendingConflictText = null
    if (!text) return
    const applied = applyRemoteText(text)
    patchSharedFile({
      status: applied ? 'connected' : 'error',
      error: applied ? null : "The shared file no longer looks like a SideTrack export.",
    })
  },

  applySharedFileText: (text) => {
    applyRemoteText(text)
  },
}))

localStorageAdapter.setSaveFailureListener(() => {
  useAppStore.setState({ saveError: true })
})

const sharedFileSync = new SharedFileSync({
  onRemoteChange: (text) => {
    const applied = applyRemoteText(text)
    if (!applied) patchSharedFile({ status: 'error', error: "The shared file no longer looks like a SideTrack export." })
  },
  onConflict: (remoteText) => {
    pendingConflictText = remoteText
    patchSharedFile({ status: 'conflict', error: null })
  },
  onError: (error) => {
    patchSharedFile({ status: 'error', error: describeError(error) })
  },
})

// Silent reconnect on boot if a handle was remembered from a previous
// session. "Silent" means it never prompts for permission — that needs an
// actual click — so if the browser didn't persist a granted permission for
// it, this lands on 'needs-reconnect' instead of 'connected', and the UI
// offers a one-click way to re-grant it.
if (isFileSystemAccessSupported()) {
  void getStoredHandle().then((handle) => {
    if (handle) void attemptReconnect(handle, false)
  })
}
