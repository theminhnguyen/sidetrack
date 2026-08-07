import { type AppState, type Timestamp, CURRENT_SCHEMA_VERSION, createEmptyState } from '../types'

export interface StorageAdapter {
  load(): AppState
  save(state: AppState): void
}

/**
 * Migration seam: each entry moves state from its key version to key+1.
 */
const migrations: Record<number, (state: AppState) => AppState> = {
  // v1 -> v2: dropped the unused `miro` scaffolding (never had a consumer,
  // see PLAN-V2.md P4.3) and added `lastExportAt` to drive the "back this
  // up" nudge (P1). `lastDigestAt` is the only field that carries over.
  1: (state) => ({
    ...state,
    schemaVersion: 2,
    settings: { lastDigestAt: state.settings?.lastDigestAt ?? null, lastExportAt: null },
  }),
}

function pickTimestamp(value: unknown): Timestamp | null {
  return typeof value === 'string' ? value : null
}

/** Rebuilt field-by-field so a stray key from an older/hand-edited shape (e.g. v1's `miro`) can never leak through. */
function normalizeSettings(raw: unknown): AppState['settings'] {
  const s = (raw && typeof raw === 'object' ? raw : {}) as Partial<AppState['settings']>
  return {
    lastDigestAt: pickTimestamp(s.lastDigestAt),
    lastExportAt: pickTimestamp(s.lastExportAt),
  }
}

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
    settings: normalizeSettings(state.settings),
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
