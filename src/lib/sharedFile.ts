/**
 * Multi-user sync via a plain JSON file the user picks themselves — typically
 * one living in a OneDrive/SharePoint-synced folder, so the file's own sync
 * client is what actually moves it between teammates. This module only knows
 * how to read/write that one file safely; it has no idea what "SideTrack
 * data" means (see useAppStore.ts for the JSON <-> AppState wiring).
 *
 * There is no cross-browser way to watch a local file for changes, so
 * "detecting" a remote edit means comparing File.lastModified against the
 * value we last saw — cheap, and enough to tell "something changed" from
 * "nothing changed" without ever reading the full content just to check.
 */

const DB_NAME = 'sidetrack-shared-file'
const STORE_NAME = 'handles'
const HANDLE_KEY = 'sharedFile'
const POLL_INTERVAL_MS = 8000
const PUSH_DEBOUNCE_MS = 500

const FILE_TYPES: FilePickerAcceptType[] = [
  { description: 'SideTrack team data', accept: { 'application/json': ['.json'] } },
]

export function isFileSystemAccessSupported(): boolean {
  return typeof window !== 'undefined' && typeof window.showOpenFilePicker === 'function'
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE_NAME)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

/** Best-effort — a locked-down profile without IndexedDB just means no silent reconnect next session, not a data-loss risk (the file itself stays the source of truth). */
export async function getStoredHandle(): Promise<FileSystemFileHandle | null> {
  try {
    const db = await openDb()
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const req = tx.objectStore(STORE_NAME).get(HANDLE_KEY)
      req.onsuccess = () => resolve((req.result as FileSystemFileHandle | undefined) ?? null)
      req.onerror = () => reject(req.error)
    })
  } catch {
    return null
  }
}

export async function storeHandle(handle: FileSystemFileHandle): Promise<void> {
  try {
    const db = await openDb()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      tx.objectStore(STORE_NAME).put(handle, HANDLE_KEY)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } catch {
    // Non-fatal — see getStoredHandle.
  }
}

export async function clearStoredHandle(): Promise<void> {
  try {
    const db = await openDb()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      tx.objectStore(STORE_NAME).delete(HANDLE_KEY)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } catch {
    // Non-fatal.
  }
}

/**
 * `requestPermission` only succeeds when called from a user gesture — pass
 * `requestIfNeeded: false` for a silent boot-time check (e.g. reconnecting a
 * remembered handle) and only re-request from an actual click handler.
 */
export async function verifyPermission(
  handle: FileSystemFileHandle,
  mode: 'read' | 'readwrite',
  requestIfNeeded: boolean,
): Promise<boolean> {
  const descriptor = { mode }
  if ((await handle.queryPermission(descriptor)) === 'granted') return true
  if (!requestIfNeeded) return false
  return (await handle.requestPermission(descriptor)) === 'granted'
}

/** For joining a shared file a teammate already created. */
export function pickExistingFile(): Promise<FileSystemFileHandle> {
  return window.showOpenFilePicker({ types: FILE_TYPES, multiple: false }).then(([handle]) => handle)
}

/** For the first person setting one up. */
export function pickNewFile(): Promise<FileSystemFileHandle> {
  return window.showSaveFilePicker({ types: FILE_TYPES, suggestedName: 'sidetrack-team.json' })
}

export interface SharedFileSyncCallbacks {
  /** A change on disk was picked up (via poll or manual pull) with no local write at risk — just apply it. */
  onRemoteChange: (text: string) => void
  /** A push found the file changed underneath it — do NOT overwrite; ask the user. */
  onConflict: (remoteText: string) => void
  onError: (error: unknown) => void
}

/**
 * Handle-agnostic on purpose: every browser-API call goes through the
 * `FileSystemFileHandle` passed into `attach`, so the conflict/debounce/poll
 * logic here can be unit-tested with a fake handle, with no real File System
 * Access API (or IndexedDB) involved.
 */
export class SharedFileSync {
  private handle: FileSystemFileHandle | null = null
  private lastKnownModified: number | null = null
  private pendingText: string | null = null
  private pushTimer: ReturnType<typeof setTimeout> | null = null
  private pollTimer: ReturnType<typeof setInterval> | null = null
  private pushInFlight = false
  // Bumped on attach/detach so a write or poll still resolving from a
  // previous handle can't apply its result (or fire a callback) after the
  // user has since disconnected or switched files.
  private epoch = 0
  private callbacks: SharedFileSyncCallbacks

  constructor(callbacks: SharedFileSyncCallbacks) {
    this.callbacks = callbacks
  }

  get name(): string | null {
    return this.handle?.name ?? null
  }

  get isConnected(): boolean {
    return this.handle !== null
  }

  /** Attaches an already permission-checked handle and returns its current content as the sync baseline. */
  async attach(handle: FileSystemFileHandle): Promise<string> {
    this.epoch++
    this.handle = handle
    const file = await handle.getFile()
    this.lastKnownModified = file.lastModified
    return file.text()
  }

  detach() {
    this.epoch++
    this.handle = null
    this.lastKnownModified = null
    this.pendingText = null
    if (this.pushTimer) clearTimeout(this.pushTimer)
    this.pushTimer = null
    this.stopPolling()
  }

  /** Debounced write. No-ops if not attached. */
  push(text: string) {
    if (!this.handle) return
    this.pendingText = text
    if (this.pushTimer) clearTimeout(this.pushTimer)
    this.pushTimer = setTimeout(() => void this.flush(), PUSH_DEBOUNCE_MS)
  }

  /** Writes immediately, bypassing the debounce — use before navigating away. */
  async flush(): Promise<void> {
    if (this.pushTimer) {
      clearTimeout(this.pushTimer)
      this.pushTimer = null
    }
    if (this.pushInFlight) {
      // A write is already running; retry shortly rather than dropping this
      // update or overlapping two writes to the same handle.
      this.pushTimer = setTimeout(() => void this.flush(), PUSH_DEBOUNCE_MS)
      return
    }
    const handle = this.handle
    const text = this.pendingText
    if (!handle || text === null) return
    const myEpoch = this.epoch
    this.pendingText = null
    this.pushInFlight = true
    try {
      const file = await handle.getFile()
      if (myEpoch !== this.epoch) return
      if (this.lastKnownModified !== null && file.lastModified !== this.lastKnownModified) {
        // Someone else wrote to the file since we last read it — don't clobber.
        // Record the new mtime now: we've seen this remote version (even
        // though we haven't decided what to do about it yet), so a poll
        // right after this shouldn't treat it as a second, separate change.
        this.lastKnownModified = file.lastModified
        this.callbacks.onConflict(await file.text())
        return
      }
      const writable = await handle.createWritable()
      await writable.write(text)
      await writable.close()
      if (myEpoch !== this.epoch) return
      const updated = await handle.getFile()
      this.lastKnownModified = updated.lastModified
    } catch (error) {
      if (myEpoch === this.epoch) this.callbacks.onError(error)
    } finally {
      this.pushInFlight = false
    }
  }

  /** Immediate manual read, independent of polling. */
  async pullNow(): Promise<void> {
    const handle = this.handle
    if (!handle) return
    const myEpoch = this.epoch
    try {
      const file = await handle.getFile()
      const text = await file.text()
      if (myEpoch !== this.epoch) return
      this.lastKnownModified = file.lastModified
      this.callbacks.onRemoteChange(text)
    } catch (error) {
      if (myEpoch === this.epoch) this.callbacks.onError(error)
    }
  }

  /** After a conflict, force-write the local version over whatever is on disk now. */
  async forcePush(text: string): Promise<void> {
    const handle = this.handle
    if (!handle) return
    const myEpoch = this.epoch
    try {
      const writable = await handle.createWritable()
      await writable.write(text)
      await writable.close()
      if (myEpoch !== this.epoch) return
      const updated = await handle.getFile()
      this.lastKnownModified = updated.lastModified
    } catch (error) {
      if (myEpoch === this.epoch) this.callbacks.onError(error)
    }
  }

  startPolling(intervalMs = POLL_INTERVAL_MS) {
    this.stopPolling()
    this.pollTimer = setInterval(() => void this.poll(), intervalMs)
  }

  stopPolling() {
    if (this.pollTimer) clearInterval(this.pollTimer)
    this.pollTimer = null
  }

  private async poll() {
    const handle = this.handle
    // A pending or in-flight push already owns the conflict check for this
    // cycle — polling too would race it and could double-fire callbacks.
    if (!handle || this.pendingText !== null || this.pushInFlight) return
    const myEpoch = this.epoch
    try {
      const file = await handle.getFile()
      if (myEpoch !== this.epoch) return
      if (this.lastKnownModified !== null && file.lastModified !== this.lastKnownModified) {
        const text = await file.text()
        if (myEpoch !== this.epoch) return
        this.lastKnownModified = file.lastModified
        this.callbacks.onRemoteChange(text)
      }
    } catch (error) {
      if (myEpoch === this.epoch) this.callbacks.onError(error)
    }
  }
}
