import { useState } from 'react'
import { useAppStore } from '../store/useAppStore'
import { downloadJSON } from '../lib/file'
import { Modal } from './Modal'

const BUTTON = 'rounded-md border border-black/15 px-2.5 py-1.5 text-xs hover:bg-black/5 disabled:opacity-40 dark:border-white/15 dark:hover:bg-white/10'
const HELP_LINK = 'text-xs text-black/50 underline decoration-black/30 hover:text-black dark:text-white/50 dark:decoration-white/30 dark:hover:text-white'

function TeamFileHelp({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="How to connect to the team file" onClose={onClose}>
      <ol className="list-decimal space-y-2 pl-5 text-sm text-black/70 dark:text-white/70">
        <li>
          Make sure OneDrive is installed and signed in with your E.ON account (Mac App Store → "OneDrive" → sign in
          with your E.ON email). Skip this if it's already set up.
        </li>
        <li>
          In Microsoft Teams, open <strong>Automation Development</strong> →{' '}
          <strong>Internal Communication</strong> channel → <strong>Files</strong> tab → the{' '}
          <strong>internals</strong> folder.
        </li>
        <li>Click "Sync" (or "Add shortcut to OneDrive") so that folder shows up in Finder.</li>
        <li>
          Come back here and click <strong>Connect team file</strong>.
        </li>
        <li>
          In the file picker, jump to OneDrive (on a Mac: press <strong>Cmd+Shift+G</strong>, then type "OneDrive"),
          then open <strong>Automation Development – Internal Communication</strong> → <strong>internals</strong>.
        </li>
        <li>
          Select <strong>sidetrack-team.json</strong> and confirm.
        </li>
      </ol>

      <div className="mt-4 rounded-md border border-black/10 bg-black/[0.03] p-3 dark:border-white/10 dark:bg-white/[0.03]">
        <p className="text-xs font-medium uppercase tracking-wide text-black/50 dark:text-white/50">
          Can't find the folder in step 5?
        </p>
        <p className="mt-1.5 text-xs text-black/70 dark:text-white/70">
          Pin it once, for good: in Finder, drag the <strong>internals</strong> folder into the sidebar under
          Favorites. macOS shares that sidebar with every app's file dialog, including this one — so it'll show up
          as a one-click shortcut here from then on too.
        </p>
      </div>

      <p className="mt-3 text-xs text-black/50 dark:text-white/50">
        Needs <strong>Chrome or Edge</strong> — Brave blocks this feature by default, even though it's also
        Chromium-based.
      </p>
      <p className="mt-1 text-xs text-black/50 dark:text-white/50">
        This is a one-time setup per browser — SideTrack remembers it after that.
      </p>
    </Modal>
  )
}

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
  const [showHelp, setShowHelp] = useState(false)

  // Chrome/Edge only — Firefox and Safari never implemented this API, and
  // Brave (despite being Chromium-based) disables it by default as a privacy
  // choice. A silent gap here previously left Brave users with no clue the
  // button was ever supposed to be there — a visible, dismissible-by-context
  // hint beats another "why doesn't this work" moment.
  if (sharedFile.status === 'unsupported') {
    return (
      <span className="text-xs text-black/40 dark:text-white/40" title="Needs Chrome or Edge (Brave blocks this by default)">
        Team file sync needs Chrome or Edge
      </span>
    )
  }

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
      <button onClick={() => void createSharedFile()} disabled={connecting} className={`${HELP_LINK} disabled:opacity-40`}>
        start one
      </button>
      <button
        onClick={() => setShowHelp(true)}
        aria-label="How to connect to the team file"
        title="How to connect to the team file"
        className="flex h-4 w-4 items-center justify-center rounded-full border border-black/20 text-[10px] text-black/50 hover:border-black/40 hover:text-black dark:border-white/20 dark:text-white/50 dark:hover:border-white/40 dark:hover:text-white"
      >
        ?
      </button>

      {showHelp && <TeamFileHelp onClose={() => setShowHelp(false)} />}

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
