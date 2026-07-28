import { type AppState, createEmptyState } from '../types'
import { migrate, type StorageAdapter } from './StorageAdapter'

const STORAGE_KEY = 'sidetrack:state'
const DEBOUNCE_MS = 500

export type SaveFailureListener = (error: unknown) => void

export class LocalStorageAdapter implements StorageAdapter {
  private pendingTimer: ReturnType<typeof setTimeout> | null = null
  private pendingState: AppState | null = null
  private onSaveFailure: SaveFailureListener | null = null

  setSaveFailureListener(listener: SaveFailureListener | null) {
    this.onSaveFailure = listener
  }

  load(): AppState {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return createEmptyState()
    try {
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
    if (!this.pendingState) return
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.pendingState))
    } catch (error) {
      this.onSaveFailure?.(error)
    }
  }
}

export const localStorageAdapter = new LocalStorageAdapter()

window.addEventListener('beforeunload', () => localStorageAdapter.flush())
