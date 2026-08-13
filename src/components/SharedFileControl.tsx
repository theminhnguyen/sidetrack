import { useAppStore } from '../store/useAppStore'
import { downloadJSON } from '../lib/file'
import { Modal } from './Modal'

const BUTTON = 'rounded-md border border-black/15 px-2.5 py-1.5 text-xs hover:bg-black/5 disabled:opacity-40 dark:border-white/15 dark:hover:bg-white/10'

export function SharedFileControl() {
  const sharedFile = useAppStore((s) => s.sharedFile)
  const connectSharedFile = useAppStore((s) => s.connectSharedFile)
  const createSharedFile = useAppStore((s) => s.createSharedFile)
  const confirmConnectSharedFile = useAppStore((s) => s.confirmConnectSharedFile)
  const cancelConnectSharedFile = useAppStore((s) => s.cancelConnectSharedFile)
  const disconnectSharedFile = useAppStore((s) => s.disconnectSharedFile)
  const reconnectSharedFile = useAppStore((s) => s.reconnectSharedFile)
  const syncSharedFileNow = useAppStore((s) => s.syncSharedFileNow)
  const exportJSON = useAppStore((s) => s.exportJSON)

  // Chrome/Edge only — File System Access API has no Firefox/Safari support
  // and never reached full standardization, so there's nothing to offer there.
  if (sharedFile.status === 'unsupported') return null

  function handleConfirmConnect() {
    // Same safety net as a plain JSON import: whatever was in this browser
    // is about to be replaced, so a copy of it leaves first.
    const date = new Date().toISOString().slice(0, 10)
    downloadJSON(`sidetrack-before-shared-connect-${date}.json`, exportJSON())
    void confirmConnectSharedFile()
  }

  if (sharedFile.status === 'connected' || sharedFile.status === 'conflict') {
    return (
      <div className="flex items-center gap-1.5 text-sm">
        <span
          role="img"
          aria-label={sharedFile.status === 'conflict' ? 'Sync conflict' : 'Synced with team file'}
          className={`h-1.5 w-1.5 shrink-0 rounded-full ${sharedFile.status === 'conflict' ? 'bg-amber-500' : 'bg-emerald-500'}`}
        />
        <span className="max-w-[9rem] truncate text-black/60 dark:text-white/60" title={sharedFile.name ?? undefined}>
          {sharedFile.name}
        </span>
        <button onClick={() => void syncSharedFileNow()} className={BUTTON}>
          Sync now
        </button>
        <button onClick={() => void disconnectSharedFile()} className={BUTTON}>
          Disconnect
        </button>
      </div>
    )
  }

  if (sharedFile.status === 'needs-reconnect') {
    return (
      <button
        onClick={() => void reconnectSharedFile()}
        className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-sm text-amber-700 hover:bg-amber-500/20 dark:text-amber-300"
      >
        Reconnect {sharedFile.name ?? 'team file'}
      </button>
    )
  }

  const connecting = sharedFile.status === 'connecting'

  return (
    <div className="flex items-center gap-2 text-sm">
      <button onClick={() => void connectSharedFile()} disabled={connecting} className={BUTTON}>
        {connecting && !sharedFile.connectPreview ? 'Connecting…' : 'Connect team file'}
      </button>
      <button
        onClick={() => void createSharedFile()}
        disabled={connecting}
        className="text-xs text-black/50 underline decoration-black/30 hover:text-black disabled:opacity-40 dark:text-white/50 dark:decoration-white/30 dark:hover:text-white"
      >
        start one
      </button>

      {sharedFile.connectPreview && (
        <Modal title="Connect to this team file?" onClose={cancelConnectSharedFile}>
          <p className="text-sm text-black/70 dark:text-white/70">
            <strong>{sharedFile.name}</strong> has <strong>{sharedFile.connectPreview.taskCount}</strong> task
            {sharedFile.connectPreview.taskCount === 1 ? '' : 's'} and{' '}
            <strong>{sharedFile.connectPreview.userCount}</strong> teammate
            {sharedFile.connectPreview.userCount === 1 ? '' : 's'}.
          </p>
          <p className="mt-2 text-sm text-black/70 dark:text-white/70">
            Connecting replaces everything currently in this browser with what's in that file. A backup of what's
            here now downloads automatically first. From then on, your changes sync there automatically.
          </p>
          <div className="mt-4 flex gap-2">
            <button
              onClick={handleConfirmConnect}
              className="rounded-md border border-black/20 bg-black/5 px-3 py-1.5 text-sm hover:bg-black/10 dark:border-white/20 dark:bg-white/10 dark:hover:bg-white/20"
            >
              Connect
            </button>
            <button
              onClick={cancelConnectSharedFile}
              className="rounded-md border border-black/15 px-3 py-1.5 text-sm hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/5"
            >
              Cancel
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}
