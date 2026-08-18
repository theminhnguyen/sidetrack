import { useRef, useState } from 'react'
import { useAppStore } from './store/useAppStore'
import { TeamBar } from './components/TeamBar'
import { TaskBoard } from './components/TaskBoard'
import { TaskDetailDrawer } from './components/TaskDetailDrawer'
import { NewTaskModal } from './components/NewTaskModal'
import { CascadeToast } from './components/CascadeToast'
import { Confetti } from './components/Confetti'
import { ThemeToggle } from './components/ThemeToggle'
import { GanttChart } from './components/GanttChart'
import { ErrorBoundary } from './components/ErrorBoundary'
import { DigestModal } from './components/DigestModal'
import { SharedFileControl } from './components/SharedFileControl'
import { SharedFileDropZone } from './components/SharedFileDropZone'
import { exportToPptx } from './lib/pptxExport'

type ViewTab = 'board' | 'gantt'

export default function App() {
  const allUsers = useAppStore((s) => s.users)
  const users = allUsers.filter((u) => u.active)
  const taskCount = useAppStore((s) => s.tasks.length)
  const currentUserId = useAppStore((s) => s.currentUserId)
  const setCurrentUser = useAppStore((s) => s.setCurrentUser)
  const saveError = useAppStore((s) => s.saveError)
  const dismissSaveError = useAppStore((s) => s.dismissSaveError)
  const sharedFile = useAppStore((s) => s.sharedFile)
  const keepMyVersionInConflict = useAppStore((s) => s.keepMyVersionInConflict)
  const takeTheirVersionInConflict = useAppStore((s) => s.takeTheirVersionInConflict)
  const dismissSharedFileError = useAppStore((s) => s.dismissSharedFileError)

  // Not persisted: a nudge that's easy to permanently silence with one click
  // defeats its own purpose — it's meant to keep surfacing until you actually connect.
  const [connectNudgeDismissed, setConnectNudgeDismissed] = useState(false)
  // Once connected, the team file holds the data and this warning would be
  // wrong. Any not-yet-connected state (including 'unsupported', where this
  // browser can't connect at all) still deserves the heads-up.
  const isSharedFileConnected = sharedFile.status === 'connected' || sharedFile.status === 'conflict'
  const showConnectNudge = !isSharedFileConnected && taskCount > 0 && !connectNudgeDismissed
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const [isNewTaskOpen, setIsNewTaskOpen] = useState(false)
  const [viewTab, setViewTab] = useState<ViewTab>('board')
  const [isDigestOpen, setIsDigestOpen] = useState(false)
  const [isExportingPptx, setIsExportingPptx] = useState(false)
  const [pptxError, setPptxError] = useState<string | null>(null)
  const ganttContainerRef = useRef<HTMLDivElement>(null)

  // Monotonic false -> true: once the Gantt has been opened it stays mounted.
  const hasOpenedGanttRef = useRef(false)
  if (viewTab === 'gantt') hasOpenedGanttRef.current = true
  const hasOpenedGantt = hasOpenedGanttRef.current

  async function handleExportPptx() {
    setPptxError(null)
    setIsExportingPptx(true)
    try {
      await exportToPptx(useAppStore.getState(), viewTab === 'gantt' ? ganttContainerRef.current : null)
    } catch {
      setPptxError('Could not generate the PowerPoint file. Please try again.')
    } finally {
      setIsExportingPptx(false)
    }
  }

  return (
    <div className="mx-auto min-h-screen max-w-7xl px-6 py-10">
      <header className="mb-8 flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">SideTrack</h1>
          <p className="text-sm text-black/50 dark:text-white/50">Side-projects, tracked without the overhead.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsDigestOpen(true)}
            className="rounded-md border border-black/20 bg-black/5 px-3 py-1.5 text-sm hover:bg-black/10 dark:border-white/20 dark:bg-white/10 dark:hover:bg-white/20"
          >
            Status report
          </button>
          <button
            onClick={handleExportPptx}
            disabled={isExportingPptx}
            className="rounded-md border border-black/20 bg-black/5 px-3 py-1.5 text-sm hover:bg-black/10 disabled:opacity-40 dark:border-white/20 dark:bg-white/10 dark:hover:bg-white/20"
          >
            {isExportingPptx ? 'Exporting…' : 'Export PPTX'}
          </button>
          <label className="text-xs text-black/40 dark:text-white/40">Acting as</label>
          <select
            value={currentUserId ?? ''}
            onChange={(e) => setCurrentUser(e.target.value || null)}
            className="rounded-md border border-black/15 bg-black/[0.03] px-2 py-1.5 text-sm outline-none focus:border-black/40 dark:border-white/15 dark:bg-black/30 dark:focus:border-white/40"
          >
            <option value="">Nobody</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
          <SharedFileControl />
          <ThemeToggle />
        </div>
      </header>

      {saveError && (
        <div className="st-rise mb-6 rounded-md border border-rose-500/40 bg-rose-500/10 px-4 py-2 text-sm text-rose-700 dark:text-rose-300">
          {isSharedFileConnected
            ? "Couldn't save to this browser's local cache — but changes are still syncing to the team file, so nothing is lost."
            : "Couldn't save to this browser's storage, and there's no team file connected — changes made now may not survive a reload."}
          <button className="ml-3 underline" onClick={dismissSaveError}>
            Dismiss
          </button>
        </div>
      )}

      {sharedFile.status === 'conflict' && (
        <div className="st-rise mb-6 rounded-md border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-sm text-amber-800 dark:text-amber-300">
          A teammate saved a change to the team file while you had one pending — pick which version to keep.
          <button
            className="ml-3 rounded-md border border-black/15 px-2 py-1 text-xs hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/10"
            onClick={takeTheirVersionInConflict}
          >
            Load their version
          </button>
          <button
            className="ml-2 rounded-md border border-black/15 px-2 py-1 text-xs hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/10"
            onClick={() => void keepMyVersionInConflict()}
          >
            Keep mine
          </button>
        </div>
      )}

      {sharedFile.status === 'error' && sharedFile.error && (
        <div className="st-rise mb-6 rounded-md border border-rose-500/40 bg-rose-500/10 px-4 py-2 text-sm text-rose-700 dark:text-rose-300">
          Team file sync problem: {sharedFile.error}
          <button className="ml-3 underline" onClick={dismissSharedFileError}>
            Dismiss
          </button>
        </div>
      )}

      {pptxError && (
        <div className="st-rise mb-6 rounded-md border border-rose-500/40 bg-rose-500/10 px-4 py-2 text-sm text-rose-700 dark:text-rose-300">
          {pptxError}
          <button className="ml-3 underline" onClick={() => setPptxError(null)}>
            Dismiss
          </button>
        </div>
      )}

      {showConnectNudge && (
        <div className="st-rise mb-6 flex flex-wrap items-center gap-3 rounded-md border border-black/15 bg-black/[0.03] px-4 py-2 text-sm dark:border-white/15 dark:bg-white/5">
          <span>
            {sharedFile.status === 'unsupported'
              ? "This data lives only in this browser — nowhere else. This browser can't connect to a team file (needs Chrome or Edge), so there's no backup beyond this device."
              : "This data lives only in this browser — nowhere else. Connect the team file so it's backed up and shared, not stuck on one machine."}
          </span>
          <button
            onClick={() => setConnectNudgeDismissed(true)}
            className="ml-auto shrink-0 text-xs text-black/50 underline hover:text-black dark:text-white/50 dark:hover:text-white"
          >
            Dismiss
          </button>
        </div>
      )}

      <section className="mb-10">
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-black/50 dark:text-white/50">Team</h2>
        <TeamBar />
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h2 className="text-sm font-medium uppercase tracking-wide text-black/50 dark:text-white/50">Tasks</h2>
            <div className="flex gap-1.5">
              {(['board', 'gantt'] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setViewTab(tab)}
                  className={`rounded-md border px-2.5 py-1 text-xs capitalize ${
                    viewTab === tab
                      ? 'border-black/40 bg-black/5 dark:border-white/40 dark:bg-white/10'
                      : 'border-black/15 hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/5'
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>
          </div>
          <button
            onClick={() => setIsNewTaskOpen(true)}
            className="rounded-md border border-black/20 bg-black/5 px-3 py-1.5 text-sm hover:bg-black/10 dark:border-white/20 dark:bg-white/10 dark:hover:bg-white/20"
          >
            + New task
          </button>
        </div>
        {viewTab === 'board' && (
          <div className="st-fade">
            <TaskBoard onOpenTask={setSelectedTaskId} />
          </div>
        )}
        {/*
          Mounted lazily on first use, then kept mounted (just hidden) — see the
          `visible` prop in GanttChart for why recreating it would leak. Its
          tab-switch visibility deliberately stays a plain `hidden` toggle
          rather than an opacity transition — animating it would need the
          element to stay in-flow while "hidden", which risks disturbing the
          mount lifecycle that was carefully untangled from a real leak earlier.
        */}
        {hasOpenedGantt && (
          <div className={viewTab === 'gantt' ? undefined : 'hidden'}>
            <ErrorBoundary>
              <GanttChart
                onOpenTask={setSelectedTaskId}
                exportContainerRef={ganttContainerRef}
                visible={viewTab === 'gantt'}
              />
            </ErrorBoundary>
          </div>
        )}
      </section>

      {selectedTaskId && (
        <TaskDetailDrawer taskId={selectedTaskId} onClose={() => setSelectedTaskId(null)} />
      )}

      {isNewTaskOpen && (
        <NewTaskModal
          onClose={() => setIsNewTaskOpen(false)}
          onCreated={(taskId) => {
            setIsNewTaskOpen(false)
            setSelectedTaskId(taskId)
          }}
        />
      )}

      {isDigestOpen && <DigestModal onClose={() => setIsDigestOpen(false)} />}

      <SharedFileDropZone />
      <CascadeToast />
      <Confetti />
    </div>
  )
}
