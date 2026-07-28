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

export function migrate(raw: unknown): AppState {
  if (!raw || typeof raw !== 'object') return createEmptyState()

  let state = raw as AppState
  if (typeof state.schemaVersion !== 'number') return createEmptyState()

  while (state.schemaVersion < CURRENT_SCHEMA_VERSION) {
    const step = migrations[state.schemaVersion]
    if (!step) return createEmptyState()
    state = step(state)
  }

  return state
}
