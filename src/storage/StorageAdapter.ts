import { type AppState, CURRENT_SCHEMA_VERSION, createEmptyState } from '../types'

export interface StorageAdapter {
  load(): AppState
  save(state: AppState): void
}

/**
 * Migration seam: each entry moves state from its key version to key+1.
 * Empty today because schemaVersion 1 is the only version that has ever
 * existed — add a `1: (state) => ({ ...state, schemaVersion: 2, ... })`
 * entry here the day the shape changes, instead of writing an ad-hoc
 * one-off migration under time pressure.
 */
const migrations: Record<number, (state: AppState) => AppState> = {}

/**
 * Fills in any top-level field this app depends on but that a hand-edited,
 * truncated, or partially-written file might be missing — most importantly
 * `settings`, whose absence otherwise crashes the digest the moment it reads
 * `state.settings.lastDigestAt`. Reference equality with the input is
 * intentionally not preserved: a state this function had to repair is not
 * the same value it was handed.
 */
function normalize(state: Partial<AppState>): AppState {
  const empty = createEmptyState()
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    users: Array.isArray(state.users) ? state.users : empty.users,
    tasks: Array.isArray(state.tasks) ? state.tasks : empty.tasks,
    auditLog: Array.isArray(state.auditLog) ? state.auditLog : empty.auditLog,
    settings: state.settings && typeof state.settings === 'object' ? state.settings : empty.settings,
  }
}

export function migrate(raw: unknown): AppState {
  if (!raw || typeof raw !== 'object') return createEmptyState()

  let state = raw as AppState
  if (typeof state.schemaVersion !== 'number') return createEmptyState()

  // A version newer than this build knows how to read must not be guessed
  // at — a future schema could have renamed or repurposed a field in a way
  // that silently corrupts data if read with today's assumptions. Treat it
  // as unreadable, the same as any other file this build can't understand.
  if (state.schemaVersion > CURRENT_SCHEMA_VERSION) return createEmptyState()

  while (state.schemaVersion < CURRENT_SCHEMA_VERSION) {
    const step = migrations[state.schemaVersion]
    if (!step) return createEmptyState()
    state = step(state)
  }

  return normalize(state)
}
