import { type AppState, createEmptyState } from '../types'
import { migrate, type StorageAdapter } from './StorageAdapter'

const STORAGE_KEY = 'sidetrack:state'
const DEBOUNCE_MS = 500

export type SaveFailureListener = (error: unknown) => void

/**
 * Reading `localStorage` can itself throw — some privacy modes and locked-down
 * enterprise profiles disable storage entirely rather than just failing writes.
 * Resolving it lazily and defensively keeps that from turning into a blank page
 * on boot, and keeps the module importable outside a browser.
 */
function getStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

export class LocalStorageAdapter implements StorageAdapter {
  private pendingTimer: ReturnType<typeof setTimeout> | null = null
  private pendingState: AppState | null = null
  private onSaveFailure: SaveFailureListener | null = null

  setSaveFailureListener(listener: SaveFailureListener | null) {
    this.onSaveFailure = listener
  }

  load(): AppState {
    const storage = getStorage()
    if (!storage) return createEmptyState()
    try {
      const raw = storage.getItem(STORAGE_KEY)
      if (!raw) return createEmptyState()
      return migrate(JSON.parse(raw))
    } catch {
      return createEmptyState()
    }
  }

  save(state: AppState): void {
    this.pendingState = state
    if (this.pendingTimer) clearTimeout(this.pendingTimer)
    this.pendingTimer = setTimeout(() => this.flush(), DEBOUNCE_MS)
  }

  /** Writes immediately, bypassing the debounce — use before navigating away. */
  flush(): void {
    if (this.pendingTimer) {
      clearTimeout(this.pendingTimer)
      this.pendingTimer = null
    }
    const state = this.pendingState
    if (!state) return
    this.pendingState = null

    const storage = getStorage()
    if (!storage) {
      this.onSaveFailure?.(new Error('This browser has no usable local storage.'))
      return
    }
    try {
      storage.setItem(STORAGE_KEY, JSON.stringify(state))
    } catch (error) {
      this.onSaveFailure?.(error)
    }
  }
}

export const localStorageAdapter = new LocalStorageAdapter()

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => localStorageAdapter.flush())
}
