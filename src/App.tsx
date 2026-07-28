import { useRef, useState } from 'react'
import { useAppStore } from './store/useAppStore'
import { downloadJSON, readFileAsText } from './lib/file'
import { TeamBar } from './components/TeamBar'
import { TaskBoard } from './components/TaskBoard'
import { TaskDetailDrawer } from './components/TaskDetailDrawer'
import { NewTaskModal } from './components/NewTaskModal'

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
  const fileInputRef = useRef<HTMLInputElement>(null)

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

  return (
    <div className="mx-auto min-h-screen max-w-5xl px-6 py-10">
      <header className="mb-8 flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">SideTrack</h1>
          <p className="text-sm text-white/50">Side-projects, tracked without the overhead.</p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-white/40">Acting as</label>
          <select
            value={currentUserId ?? ''}
            onChange={(e) => setCurrentUser(e.target.value || null)}
            className="rounded-md border border-white/15 bg-black/30 px-2 py-1.5 text-sm outline-none focus:border-white/40"
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
            className="rounded-md border border-white/15 px-3 py-1.5 text-sm hover:bg-white/5"
          >
            Export JSON
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="rounded-md border border-white/15 px-3 py-1.5 text-sm hover:bg-white/5"
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
        </div>
      </header>

      {saveError && (
        <div className="mb-6 rounded-md border border-rose-500/40 bg-rose-500/10 px-4 py-2 text-sm text-rose-300">
          Couldn't save to this browser's storage. Export a backup so you don't lose changes.
          <button className="ml-3 underline" onClick={dismissSaveError}>
            Dismiss
          </button>
        </div>
      )}

      {importMessage && (
        <div className="mb-6 rounded-md border border-white/15 bg-white/5 px-4 py-2 text-sm">
          {importMessage}
          <button className="ml-3 underline" onClick={() => setImportMessage(null)}>
            Dismiss
          </button>
        </div>
      )}

      <section className="mb-10">
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-white/50">Team</h2>
        <TeamBar />
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-medium uppercase tracking-wide text-white/50">Tasks</h2>
          <button
            onClick={() => setIsNewTaskOpen(true)}
            className="rounded-md border border-white/20 bg-white/10 px-3 py-1.5 text-sm hover:bg-white/20"
          >
            + New task
          </button>
        </div>
        <TaskBoard onOpenTask={setSelectedTaskId} />
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
    </div>
  )
}
