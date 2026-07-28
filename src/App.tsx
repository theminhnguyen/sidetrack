import { useRef, useState } from 'react'
import { useAppStore } from './store/useAppStore'
import { downloadJSON, readFileAsText } from './lib/file'
import { TeamBar } from './components/TeamBar'
import { TaskBoard } from './components/TaskBoard'
import { TaskDetailDrawer } from './components/TaskDetailDrawer'
import { NewTaskModal } from './components/NewTaskModal'
import { CascadeToast } from './components/CascadeToast'
import { ThemeToggle } from './components/ThemeToggle'
import { GanttChart } from './components/GanttChart'
import { ErrorBoundary } from './components/ErrorBoundary'
import { DigestModal } from './components/DigestModal'
import { exportToPptx } from './lib/pptxExport'

type ViewTab = 'board' | 'gantt'

export default function App() {
  const allUsers = useAppStore((s) => s.users)
  const users = allUsers.filter((u) => u.active)
  const currentUserId = useAppStore((s) => s.currentUserId)
  const setCurrentUser = useAppStore((s) => s.setCurrentUser)
  const saveError = useAppStore((s) => s.saveError)
  const dismissSaveError = useAppStore((s) => s.dismissSaveError)
  const exportJSON = useAppStore((s) => s.exportJSON)
  const importJSON = useAppStore((s) => s.importJSON)

  const [importMessage, setImportMessage] = useState<string | null>(null)
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const [isNewTaskOpen, setIsNewTaskOpen] = useState(false)
  const [viewTab, setViewTab] = useState<ViewTab>('board')
  const [isDigestOpen, setIsDigestOpen] = useState(false)
  const [isExportingPptx, setIsExportingPptx] = useState(false)
  const [pptxError, setPptxError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const ganttContainerRef = useRef<HTMLDivElement>(null)

  function handleExport() {
    const json = exportJSON()
    const date = new Date().toISOString().slice(0, 10)
    downloadJSON(`sidetrack-backup-${date}.json`, json)
  }

  async function handleImportFile(file: File) {
    const text = await readFileAsText(file)
    const result = importJSON(text)
    setImportMessage(result.ok ? 'Import successful.' : `Import failed: ${result.error}`)
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
          <ThemeToggle />
        </div>
      </header>

      {saveError && (
        <div className="mb-6 rounded-md border border-rose-500/40 bg-rose-500/10 px-4 py-2 text-sm text-rose-700 dark:text-rose-300">
          Couldn't save to this browser's storage. Export a backup so you don't lose changes.
          <button className="ml-3 underline" onClick={dismissSaveError}>
            Dismiss
          </button>
        </div>
      )}

      {pptxError && (
        <div className="mb-6 rounded-md border border-rose-500/40 bg-rose-500/10 px-4 py-2 text-sm text-rose-700 dark:text-rose-300">
          {pptxError}
          <button className="ml-3 underline" onClick={() => setPptxError(null)}>
            Dismiss
          </button>
        </div>
      )}

      {importMessage && (
        <div className="mb-6 rounded-md border border-black/15 bg-black/[0.03] px-4 py-2 text-sm dark:border-white/15 dark:bg-white/5">
          {importMessage}
          <button className="ml-3 underline" onClick={() => setImportMessage(null)}>
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
        {viewTab === 'board' ? (
          <TaskBoard onOpenTask={setSelectedTaskId} />
        ) : (
          <ErrorBoundary>
            <GanttChart onOpenTask={setSelectedTaskId} exportContainerRef={ganttContainerRef} />
          </ErrorBoundary>
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

      <CascadeToast />
    </div>
  )
}
