import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SharedFileSync, isFileSystemAccessSupported } from './sharedFile'

describe('isFileSystemAccessSupported', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('is false in this test environment (Node, no window at all)', () => {
    expect(isFileSystemAccessSupported()).toBe(false)
  })

  it('is false when window exists but lacks the API (Firefox, Safari)', () => {
    vi.stubGlobal('window', {})
    expect(isFileSystemAccessSupported()).toBe(false)
  })

  it('is true when window.showOpenFilePicker is present (Chrome, Edge)', () => {
    vi.stubGlobal('window', { showOpenFilePicker: () => {} })
    expect(isFileSystemAccessSupported()).toBe(true)
  })
})

/**
 * A fake FileSystemFileHandle — good enough to exercise SharedFileSync's own
 * logic (debounce, conflict detection, epoch guarding) without touching the
 * real File System Access API, which vitest's environments don't implement
 * at all and which no automated browser tool can drive (it's a native OS
 * file picker). "modified" advances on every write, exactly like a real
 * filesystem's mtime would.
 */
function makeFakeHandle(initialText: string, initialModified = 1000) {
  let text = initialText
  let modified = initialModified
  const writes: string[] = []
  const handle = {
    kind: 'file' as const,
    name: 'sidetrack-team.json',
    isSameEntry: async () => true,
    queryPermission: async () => 'granted' as const,
    requestPermission: async () => 'granted' as const,
    getFile: async () =>
      ({
        lastModified: modified,
        text: async () => text,
      }) as unknown as File,
    createWritable: async () =>
      ({
        write: async (data: string) => {
          writes.push(data)
        },
        close: async () => {
          text = writes[writes.length - 1]
          modified += 1
        },
      }) as unknown as FileSystemWritableFileStream,
  } as unknown as FileSystemFileHandle

  return {
    handle,
    /** Simulates a teammate's OneDrive sync landing a new version on disk, entirely outside this instance's knowledge. */
    externalWrite(newText: string) {
      text = newText
      modified += 1
    },
    get currentText() {
      return text
    },
  }
}

function makeCallbacks() {
  return {
    onRemoteChange: vi.fn(),
    onConflict: vi.fn(),
    onError: vi.fn(),
  }
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('SharedFileSync — attach', () => {
  it('returns the file\'s current content as the sync baseline', async () => {
    const { handle } = makeFakeHandle('{"tasks":[]}')
    const callbacks = makeCallbacks()
    const sync = new SharedFileSync(callbacks)

    const text = await sync.attach(handle)

    expect(text).toBe('{"tasks":[]}')
    expect(sync.isConnected).toBe(true)
    expect(sync.name).toBe('sidetrack-team.json')
  })
})

describe('SharedFileSync — push', () => {
  it('debounces rapid pushes into a single write', async () => {
    const fake = makeFakeHandle('{}')
    const sync = new SharedFileSync(makeCallbacks())
    await sync.attach(fake.handle)

    sync.push('{"v":1}')
    sync.push('{"v":2}')
    sync.push('{"v":3}')
    await vi.advanceTimersByTimeAsync(600)

    expect(fake.currentText).toBe('{"v":3}')
  })

  it('is a no-op before attach', () => {
    const callbacks = makeCallbacks()
    const sync = new SharedFileSync(callbacks)

    sync.push('{"v":1}')

    expect(sync.isConnected).toBe(false)
  })

  it('writes cleanly when nothing changed remotely, without touching either callback', async () => {
    const fake = makeFakeHandle('{}')
    const callbacks = makeCallbacks()
    const sync = new SharedFileSync(callbacks)
    await sync.attach(fake.handle)

    sync.push('{"v":1}')
    await vi.advanceTimersByTimeAsync(600)

    expect(fake.currentText).toBe('{"v":1}')
    expect(callbacks.onConflict).not.toHaveBeenCalled()
    expect(callbacks.onRemoteChange).not.toHaveBeenCalled()
  })

  it('detects a conflict instead of silently overwriting a teammate\'s change', async () => {
    const fake = makeFakeHandle('{"v":0}')
    const callbacks = makeCallbacks()
    const sync = new SharedFileSync(callbacks)
    await sync.attach(fake.handle)

    // A teammate's OneDrive sync drops a newer version while we're mid-edit.
    fake.externalWrite('{"v":"theirs"}')

    sync.push('{"v":"mine"}')
    await vi.advanceTimersByTimeAsync(600)

    expect(callbacks.onConflict).toHaveBeenCalledWith('{"v":"theirs"}')
    // The file on disk must still hold their version — not silently clobbered.
    expect(fake.currentText).toBe('{"v":"theirs"}')
  })
})

describe('SharedFileSync — pullNow / forcePush', () => {
  it('pullNow reports the current content via onRemoteChange', async () => {
    const fake = makeFakeHandle('{"v":1}')
    const callbacks = makeCallbacks()
    const sync = new SharedFileSync(callbacks)
    await sync.attach(fake.handle)
    fake.externalWrite('{"v":2}')

    await sync.pullNow()

    expect(callbacks.onRemoteChange).toHaveBeenCalledWith('{"v":2}')
  })

  it('forcePush overwrites even after a conflict was detected', async () => {
    const fake = makeFakeHandle('{"v":0}')
    const callbacks = makeCallbacks()
    const sync = new SharedFileSync(callbacks)
    await sync.attach(fake.handle)
    fake.externalWrite('{"v":"theirs"}')

    await sync.forcePush('{"v":"mine, deliberately"}')

    expect(fake.currentText).toBe('{"v":"mine, deliberately"}')
  })
})

describe('SharedFileSync — polling', () => {
  it('picks up a remote change on the next poll', async () => {
    const fake = makeFakeHandle('{"v":1}')
    const callbacks = makeCallbacks()
    const sync = new SharedFileSync(callbacks)
    await sync.attach(fake.handle)
    sync.startPolling(1000)

    fake.externalWrite('{"v":2}')
    await vi.advanceTimersByTimeAsync(1000)

    expect(callbacks.onRemoteChange).toHaveBeenCalledWith('{"v":2}')
  })

  it('does not poll after stopPolling', async () => {
    const fake = makeFakeHandle('{"v":1}')
    const callbacks = makeCallbacks()
    const sync = new SharedFileSync(callbacks)
    await sync.attach(fake.handle)
    sync.startPolling(1000)
    sync.stopPolling()

    fake.externalWrite('{"v":2}')
    await vi.advanceTimersByTimeAsync(5000)

    expect(callbacks.onRemoteChange).not.toHaveBeenCalled()
  })

  it('skips a poll cycle while a push is pending, to avoid racing the conflict check', async () => {
    const fake = makeFakeHandle('{"v":1}')
    const callbacks = makeCallbacks()
    const sync = new SharedFileSync(callbacks)
    await sync.attach(fake.handle)
    sync.startPolling(1000)

    sync.push('{"v":"mine"}') // debounced 500ms — still pending when the 1000ms poll tick fires
    fake.externalWrite('{"v":"theirs, mid-flight"}')
    await vi.advanceTimersByTimeAsync(1000)

    // The push's own conflict check (not the poll) should have handled this.
    expect(callbacks.onConflict).toHaveBeenCalledTimes(1)
    expect(callbacks.onRemoteChange).not.toHaveBeenCalled()
  })
})

describe('SharedFileSync — detach', () => {
  it('stops polling', async () => {
    const fake = makeFakeHandle('{"v":1}')
    const callbacks = makeCallbacks()
    const sync = new SharedFileSync(callbacks)
    await sync.attach(fake.handle)
    sync.startPolling(1000)

    sync.detach()
    fake.externalWrite('{"v":2}')
    await vi.advanceTimersByTimeAsync(5000)

    expect(callbacks.onRemoteChange).not.toHaveBeenCalled()
    expect(sync.isConnected).toBe(false)
  })

  it('a push already in flight when detach happens does not fire callbacks afterwards', async () => {
    const fake = makeFakeHandle('{"v":0}')
    const callbacks = makeCallbacks()
    const sync = new SharedFileSync(callbacks)
    await sync.attach(fake.handle)
    fake.externalWrite('{"v":"theirs"}') // guarantees this push would hit the conflict branch

    sync.push('{"v":"mine"}')
    // Call flush() directly (bypassing the debounce timer) and deliberately
    // don't await it yet: an async function only runs up to its first
    // `await` before yielding, so detach() below is guaranteed to run before
    // flush()'s `await handle.getFile()` resolves — exactly the race this
    // test exists to catch.
    const flushed = sync.flush()
    sync.detach()
    await flushed

    expect(callbacks.onConflict).not.toHaveBeenCalled()
    expect(callbacks.onError).not.toHaveBeenCalled()
  })
})
