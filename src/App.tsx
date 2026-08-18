import { useRef, useState } from 'react'
import { useAppStore } from './store/useAppStore'
import { downloadJSON, readFileAsText } from './lib/file'
import { shouldNudgeExport } from './lib/dates'
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
import { Modal } from './components/Modal'
import { SharedFileControl } from './components/SharedFileControl'
import { SharedFileDropZone } from './components/SharedFileDropZone'
import { exportToPptx } from './lib/pptxExport'

interface PendingImport {
  text: string
  userCount: number
  taskCount: number
}

type ViewTab = 'board' | 'gantt'

export default function App() {
  const allUsers = useAppStore((s) => s.users)
  const users = allUsers.filter((u) => u.active)
  const taskCount = useAppStore((s) => s.tasks.length)
  const lastExportAt = useAppStore((s) => s.settings.lastExportAt)
  const currentUserId = useAppStore((s) => s.currentUserId)
  const setCurrentUser = useAppStore((s) => s.setCurrentUser)
  const saveError = useAppStore((s) => s.saveError)
  const dismissSaveError = useAppStore((s) => s.dismissSaveError)
  const exportJSON = useAppStore((s) => s.exportJSON)
  const previewImport = useAppStore((s) => s.previewImport)
  const importJSON = useAppStore((s) => s.importJSON)
  const sharedFile = useAppStore((s) => s.sharedFile)
  const keepMyVersionInConflict = useAppStore((s) => s.keepMyVersionInConflict)
  const takeTheirVersionInConflict = useAppStore((s) => s.takeTheirVersionInConflict)
  const dismissSharedFileError = useAppStore((s) => s.dismissSharedFileError)

  const [importMessage, setImportMessage] = useState<string | null>(null)
  const [pendingImport, setPendingImport] = useState<PendingImport | null>(null)
  // Not persisted: a nudge that's easy to permanently silence with one click
  // defeats its own purpose — it's meant to keep surfacing until you actually export.
  const [exportNudgeDismissed, setExportNudgeDismissed] = useState(false)
  const showExportNudge = shouldNudgeExport(lastExportAt, taskCount > 0) && !exportNudgeDismissed
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const [isNewTaskOpen, setIsNewTaskOpen] = useState(false)
  const [viewTab, setViewTab] = useState<ViewTab>('board')
  const [isDigestOpen, setIsDigestOpen] = useState(false)
  const [isExportingPptx, setIsExportingPptx] = useState(false)
  const [pptxError, setPptxError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const ganttContainerRef = useRef<HTMLDivElement>(null)

  // Monotonic false -> true: once the Gantt has been opened it stays mounted.
  const hasOpenedGanttRef = useRef(false)
  if (viewTab === 'gantt') hasOpenedGanttRef.current = true
  const hasOpenedGantt = hasOpenedGanttRef.current

  function handleExport() {
    const json = exportJSON()
    const date = new Date().toISOString().slice(0, 10)
    downloadJSON(`sidetrack-backup-${date}.json`, json)
  }

  async function handleImportFile(file: File) {
    const text = await readFileAsText(file)
    const preview = previewImport(text)
    if (!preview.ok) {
      setImportMessage(`Import failed: ${preview.error}`)
      return
    }
    // Importing replaces everything at once with no undo, and this is the
    // only copy of the data — so it's confirmed with actual numbers, not a
    // generic warning, and there's a real file to fall back to if it goes wrong.
    setPendingImport({ text, userCount: preview.userCount, taskCount: preview.taskCount })
  }

  function confirmImport() {
    if (!pendingImport) return
    const date = new Date().toISOString().slice(0, 10)
    downloadJSON(`sidetrack-before-import-${date}.json`, exportJSON())
    const result = importJSON(pendingImport.text)
    setImportMessage(result.ok ? 'Import successful.' : `Import failed: ${result.error}`)
    setPendingImport(null)
  }

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
          <button
            onClick={handleExport}
            className="rounded-md border border-black/15 px-3 py-1.5 text-sm hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/5"
          >
            Export JSON
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="rounded-md border border-black/15 px-3 py-1.5 text-sm hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/5"
          >
            Import JSON
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void handleImportFile(file)
              e.target.value = ''
            }}
          />
          <SharedFileControl />
          <ThemeToggle />
        </div>
      </header>

      {saveError && (
        <div className="st-rise mb-6 rounded-md border border-rose-500/40 bg-rose-500/10 px-4 py-2 text-sm text-rose-700 dark:text-rose-300">
          Couldn't save to this browser's storage. Export a backup so you don't lose changes.
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

      {importMessage && (
        <div className="st-rise mb-6 rounded-md border border-black/15 bg-black/[0.03] px-4 py-2 text-sm dark:border-white/15 dark:bg-white/5">
          {importMessage}
          <button className="ml-3 underline" onClick={() => setImportMessage(null)}>
            Dismiss
          </button>
        </div>
      )}

      {showExportNudge && (
        <div className="st-rise mb-6 flex flex-wrap items-center gap-3 rounded-md border border-black/15 bg-black/[0.03] px-4 py-2 text-sm dark:border-white/15 dark:bg-white/5">
          <span>
            This data lives only in this browser — nowhere else. Export a backup so a cleared cache or a new
            machine can't take it with it.
          </span>
          <button
            onClick={handleExport}
            className="shrink-0 rounded-md border border-black/20 bg-black/5 px-2.5 py-1 text-xs hover:bg-black/10 dark:border-white/20 dark:bg-white/10 dark:hover:bg-white/20"
          >
            Export JSON
          </button>
          <button
            onClick={() => setExportNudgeDismissed(true)}
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

      {pendingImport && (
        <Modal title="Replace all data?" onClose={() => setPendingImport(null)}>
          <p className="text-sm text-black/70 dark:text-white/70">
            This browser currently has <strong>{taskCount}</strong> task{taskCount === 1 ? '' : 's'} and{' '}
            <strong>{allUsers.length}</strong> teammate{allUsers.length === 1 ? '' : 's'}. The file you picked has{' '}
            <strong>{pendingImport.taskCount}</strong> task{pendingImport.taskCount === 1 ? '' : 's'} and{' '}
            <strong>{pendingImport.userCount}</strong> teammate{pendingImport.userCount === 1 ? '' : 's'}.
          </p>
          <p className="mt-2 text-sm text-black/70 dark:text-white/70">
            Importing replaces everything currently stored here. This can't be undone from inside the app.
          </p>
          <p className="mt-2 text-xs text-black/50 dark:text-white/50">
            A backup of what's here now will download automatically before the replace happens.
          </p>
          <div className="mt-4 flex gap-2">
            <button
              onClick={confirmImport}
              className="rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-1.5 text-sm text-rose-700 hover:bg-rose-500/20 dark:text-rose-300"
            >
              Back up &amp; replace
            </button>
            <button
              onClick={() => setPendingImport(null)}
              className="rounded-md border border-black/15 px-3 py-1.5 text-sm hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/5"
            >
              Cancel
            </button>
          </div>
        </Modal>
      )}

      <SharedFileDropZone />
      <CascadeToast />
      <Confetti />
    </div>
  )
}
