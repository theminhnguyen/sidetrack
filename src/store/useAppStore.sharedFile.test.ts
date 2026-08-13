import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The real File System Access API and IndexedDB don't exist in Node (this
 * suite runs in vitest's default Node environment, like the rest of the
 * store tests) and can't be driven by any automated tool anyway — a real
 * run needs an actual OS file picker and a real synced folder, which is why
 * this mocks ../lib/sharedFile entirely rather than trying to fake a browser.
 * What's under test here is useAppStore.ts's own logic: does it stage a
 * connect preview before replacing local data, does it apply what comes
 * back from a pull/conflict resolution, does it call the right sync methods
 * for each action.
 */
const fakeSync = {
  attach: vi.fn(async (handle: { getFile: () => Promise<{ text: () => Promise<string> }> }) =>
    handle.getFile().then((f) => f.text()),
  ),
  detach: vi.fn(),
  push: vi.fn((_text: string) => {}),
  flush: vi.fn(async () => {}),
  pullNow: vi.fn(async () => {}),
  forcePush: vi.fn(async (_text: string) => {}),
  startPolling: vi.fn(),
  stopPolling: vi.fn(),
  isConnected: false,
  name: null as string | null,
}

let capturedCallbacks: {
  onRemoteChange: (text: string) => void
  onConflict: (remoteText: string) => void
  onError: (error: unknown) => void
} | null = null

vi.mock('../lib/sharedFile', () => ({
  isFileSystemAccessSupported: () => true,
  getStoredHandle: vi.fn(async () => null),
  storeHandle: vi.fn(async () => {}),
  clearStoredHandle: vi.fn(async () => {}),
  verifyPermission: vi.fn(async () => true),
  pickExistingFile: vi.fn(),
  pickNewFile: vi.fn(),
  SharedFileSync: class {
    constructor(callbacks: typeof capturedCallbacks) {
      capturedCallbacks = callbacks
    }
    attach = fakeSync.attach
    detach = fakeSync.detach
    push = fakeSync.push
    flush = fakeSync.flush
    pullNow = fakeSync.pullNow
    forcePush = fakeSync.forcePush
    startPolling = fakeSync.startPolling
    stopPolling = fakeSync.stopPolling
    get isConnected() {
      return fakeSync.isConnected
    }
    get name() {
      return fakeSync.name
    }
  },
}))

const { useAppStore } = await import('./useAppStore')
const { pickExistingFile, pickNewFile, verifyPermission, storeHandle, clearStoredHandle } = await import('../lib/sharedFile')

function makeExportText(overrides: Partial<{ userCount: number; taskCount: number }> = {}) {
  const users = Array.from({ length: overrides.userCount ?? 1 }, (_, i) => ({ id: `u_${i}` }))
  const tasks = Array.from({ length: overrides.taskCount ?? 2 }, (_, i) => ({ id: `t_${i}` }))
  return JSON.stringify({ schemaVersion: 3, users, tasks, auditLog: [], settings: { lastDigestAt: null, lastExportAt: null } })
}

/** Mirrors the real FileSystemFileHandle shape the store code actually calls: handle.getFile().then(f => f.text()). */
function makeFakeHandle(text: string, name = 'team.json') {
  return { name, getFile: async () => ({ text: async () => text }) }
}

beforeEach(() => {
  vi.clearAllMocks()
  fakeSync.isConnected = false
  fakeSync.name = null
  useAppStore.setState({
    sharedFile: { status: 'disconnected', name: null, error: null, connectPreview: null },
  })
})

describe('connectSharedFile / confirmConnectSharedFile / cancelConnectSharedFile', () => {
  it('stages a preview instead of replacing data immediately', async () => {
    const handle = makeFakeHandle(makeExportText({ userCount: 3, taskCount: 5 }))
    vi.mocked(pickExistingFile).mockResolvedValue(handle as never)
    vi.mocked(verifyPermission).mockResolvedValue(true)

    await useAppStore.getState().connectSharedFile()

    const state = useAppStore.getState()
    expect(state.sharedFile.connectPreview).toEqual({ userCount: 3, taskCount: 5 })
    expect(state.sharedFile.name).toBe('team.json')
    // Not applied yet — that's confirmConnectSharedFile's job.
    expect(fakeSync.attach).not.toHaveBeenCalled()
  })

  it('rejects a file that is not a SideTrack export, without touching local data', async () => {
    vi.mocked(pickExistingFile).mockResolvedValue(makeFakeHandle('{"not":"sidetrack"}', 'random.json') as never)
    vi.mocked(verifyPermission).mockResolvedValue(true)

    await useAppStore.getState().connectSharedFile()

    expect(useAppStore.getState().sharedFile.status).toBe('error')
    expect(useAppStore.getState().sharedFile.connectPreview).toBeNull()
  })

  it('treats a cancelled picker as a quiet return to disconnected, not an error', async () => {
    vi.mocked(pickExistingFile).mockRejectedValue(new DOMException('cancelled', 'AbortError'))

    await useAppStore.getState().connectSharedFile()

    expect(useAppStore.getState().sharedFile.status).toBe('disconnected')
    expect(useAppStore.getState().sharedFile.error).toBeNull()
  })

  it('confirm applies the staged data, attaches, and remembers the handle', async () => {
    const handle = makeFakeHandle(makeExportText({ userCount: 2, taskCount: 4 }))
    vi.mocked(pickExistingFile).mockResolvedValue(handle as never)
    vi.mocked(verifyPermission).mockResolvedValue(true)
    await useAppStore.getState().connectSharedFile()

    await useAppStore.getState().confirmConnectSharedFile()

    expect(useAppStore.getState().tasks).toHaveLength(4)
    expect(useAppStore.getState().users).toHaveLength(2)
    expect(useAppStore.getState().sharedFile.status).toBe('connected')
    expect(useAppStore.getState().sharedFile.connectPreview).toBeNull()
    expect(fakeSync.attach).toHaveBeenCalledWith(handle)
    expect(fakeSync.startPolling).toHaveBeenCalled()
    expect(storeHandle).toHaveBeenCalledWith(handle)
  })

  it('cancel discards the staged preview and leaves local data untouched', async () => {
    const before = useAppStore.getState().tasks
    vi.mocked(pickExistingFile).mockResolvedValue(makeFakeHandle(makeExportText({ taskCount: 99 })) as never)
    vi.mocked(verifyPermission).mockResolvedValue(true)
    await useAppStore.getState().connectSharedFile()

    useAppStore.getState().cancelConnectSharedFile()

    expect(useAppStore.getState().tasks).toBe(before)
    expect(useAppStore.getState().sharedFile.status).toBe('disconnected')
    expect(useAppStore.getState().sharedFile.connectPreview).toBeNull()

    // And confirming afterwards must be a no-op — nothing staged anymore.
    await useAppStore.getState().confirmConnectSharedFile()
    expect(useAppStore.getState().tasks).toBe(before)
  })
})

describe('createSharedFile', () => {
  it('seeds the new file with the current board via forcePush, not with whatever the picker returned', async () => {
    vi.mocked(pickNewFile).mockResolvedValue(makeFakeHandle('', 'new-team.json') as never)
    vi.mocked(verifyPermission).mockResolvedValue(true)
    const before = useAppStore.getState().tasks

    await useAppStore.getState().createSharedFile()

    expect(fakeSync.forcePush).toHaveBeenCalledTimes(1)
    const pushed = JSON.parse(vi.mocked(fakeSync.forcePush).mock.calls[0][0])
    expect(pushed.tasks).toEqual(before)
    expect(useAppStore.getState().sharedFile.status).toBe('connected')
    expect(fakeSync.startPolling).toHaveBeenCalled()
  })
})

describe('disconnectSharedFile', () => {
  it('detaches, forgets the handle, and resets status', async () => {
    fakeSync.isConnected = true
    useAppStore.setState({ sharedFile: { status: 'connected', name: 'team.json', error: null, connectPreview: null } })

    await useAppStore.getState().disconnectSharedFile()

    expect(fakeSync.detach).toHaveBeenCalled()
    expect(clearStoredHandle).toHaveBeenCalled()
    expect(useAppStore.getState().sharedFile).toEqual({ status: 'disconnected', name: null, error: null, connectPreview: null })
  })
})

describe('conflict resolution', () => {
  it('onConflict from the sync layer surfaces a conflict status', () => {
    capturedCallbacks!.onConflict('{"schemaVersion":3,"users":[],"tasks":[],"auditLog":[],"settings":{"lastDigestAt":null,"lastExportAt":null}}')

    expect(useAppStore.getState().sharedFile.status).toBe('conflict')
  })

  it('keepMyVersionInConflict force-pushes the current local board', async () => {
    capturedCallbacks!.onConflict('{"schemaVersion":3,"users":[],"tasks":[{"id":"theirs"}],"auditLog":[],"settings":{"lastDigestAt":null,"lastExportAt":null}}')
    const localTasksBefore = useAppStore.getState().tasks

    await useAppStore.getState().keepMyVersionInConflict()

    expect(fakeSync.forcePush).toHaveBeenCalledTimes(1)
    const pushed = JSON.parse(vi.mocked(fakeSync.forcePush).mock.calls[0][0])
    expect(pushed.tasks).toEqual(localTasksBefore)
    expect(useAppStore.getState().sharedFile.status).toBe('connected')
  })

  it('takeTheirVersionInConflict adopts the remote content that caused the conflict', async () => {
    capturedCallbacks!.onConflict(makeExportText({ taskCount: 7, userCount: 1 }))

    useAppStore.getState().takeTheirVersionInConflict()

    expect(useAppStore.getState().tasks).toHaveLength(7)
    expect(useAppStore.getState().sharedFile.status).toBe('connected')
  })
})

describe('sync error surfacing', () => {
  it('onError from the sync layer surfaces as a dismissible error', () => {
    capturedCallbacks!.onError(new Error('disk full'))

    expect(useAppStore.getState().sharedFile.status).toBe('error')
    expect(useAppStore.getState().sharedFile.error).toBe('disk full')

    useAppStore.getState().dismissSharedFileError()

    expect(useAppStore.getState().sharedFile.error).toBeNull()
  })
})

describe('onRemoteChange (idle pull/poll — nothing local at risk)', () => {
  it('applies the incoming board directly, no confirmation needed', () => {
    capturedCallbacks!.onRemoteChange(makeExportText({ taskCount: 3, userCount: 2 }))

    expect(useAppStore.getState().tasks).toHaveLength(3)
    expect(useAppStore.getState().users).toHaveLength(2)
  })
})
