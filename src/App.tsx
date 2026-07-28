import { useRef, useState } from 'react'
import { useAppStore } from './store/useAppStore'
import { downloadJSON, readFileAsText } from './lib/file'
import { formatDateOnly } from './lib/dates'

const CAPACITY_DOT: Record<string, string> = {
  green: 'bg-emerald-500',
  yellow: 'bg-amber-500',
  red: 'bg-rose-500',
}

const STATUS_LABEL: Record<string, string> = {
  todo: 'To do',
  in_progress: 'In progress',
  blocked: 'Blocked',
  done: 'Done',
}

export default function App() {
  const state = useAppStore()
  const [importMessage, setImportMessage] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  function handleExport() {
    const json = state.exportJSON()
    const date = new Date().toISOString().slice(0, 10)
    downloadJSON(`sidetrack-backup-${date}.json`, json)
  }

  async function handleImportFile(file: File) {
    const text = await readFileAsText(file)
    const result = state.importJSON(text)
    setImportMessage(result.ok ? 'Import successful.' : `Import failed: ${result.error}`)
  }

  return (
    <div className="min-h-screen mx-auto max-w-5xl px-6 py-10">
      <header className="mb-8 flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">SideTrack</h1>
          <p className="text-sm text-white/50">Side-projects, tracked without the overhead.</p>
        </div>
        <div className="flex gap-2">
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

      {state.saveError && (
        <div className="mb-6 rounded-md border border-rose-500/40 bg-rose-500/10 px-4 py-2 text-sm text-rose-300">
          Couldn't save to this browser's storage. Export a backup so you don't lose changes.
          <button className="ml-3 underline" onClick={state.dismissSaveError}>
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
        <div className="flex flex-wrap gap-3">
          {state.users.map((user) => (
            <div
              key={user.id}
              className="flex items-center gap-2 rounded-full border border-white/15 py-1 pl-1 pr-3"
            >
              <span
                className="flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold text-black/80"
                style={{ backgroundColor: user.color }}
              >
                {user.initials}
              </span>
              <span className="text-sm">{user.name}</span>
              <span className={`h-2.5 w-2.5 rounded-full ${CAPACITY_DOT[user.capacity.status]}`} />
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-white/50">Tasks</h2>
        <ul className="space-y-2">
          {state.tasks.map((task) => {
            const assignee = state.users.find((u) => u.id === task.assigneeId)
            return (
              <li
                key={task.id}
                className="rounded-lg border border-white/10 bg-white/[0.03] px-4 py-3"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="font-medium">{task.title}</span>
                  <span className="shrink-0 rounded-full border border-white/15 px-2 py-0.5 text-xs text-white/70">
                    {STATUS_LABEL[task.status]}
                  </span>
                </div>
                <div className="mt-1 flex items-center gap-3 text-xs text-white/50">
                  <span className="rounded border border-white/15 px-1.5">{task.size}</span>
                  <span>{assignee?.name ?? 'Unassigned'}</span>
                  <span>Due {formatDateOnly(task.dueDate)}</span>
                  {task.snoozeCount >= 2 && <span>⏰×{task.snoozeCount}</span>}
                </div>
              </li>
            )
          })}
        </ul>
      </section>
    </div>
  )
}
