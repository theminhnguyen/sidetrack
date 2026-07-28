import { useState } from 'react'
import type { Task } from '../types'

export function DependencyPicker({
  allTasks,
  selfId,
  value,
  onChange,
}: {
  allTasks: Task[]
  selfId: string
  value: string[]
  onChange: (next: string[]) => void
}) {
  const [query, setQuery] = useState('')

  const candidates = allTasks.filter(
    (t) =>
      t.id !== selfId &&
      !value.includes(t.id) &&
      t.title.toLowerCase().includes(query.trim().toLowerCase()),
  )
  const selected = value
    .map((id) => allTasks.find((t) => t.id === id))
    .filter((t): t is Task => Boolean(t))

  return (
    <div>
      {selected.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {selected.map((t) => (
            <span
              key={t.id}
              className="flex items-center gap-1.5 rounded-full border border-black/15 bg-black/[0.03] px-2 py-0.5 text-xs dark:border-white/15 dark:bg-white/5"
            >
              {t.title}
              <button
                onClick={() => onChange(value.filter((id) => id !== t.id))}
                className="text-black/40 hover:text-black dark:text-white/40 dark:hover:text-white"
                aria-label={`Remove dependency on ${t.title}`}
              >
                ✕
              </button>
            </span>
          ))}
        </div>
      )}
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search tasks to depend on…"
        className="w-full rounded-md border border-black/15 bg-black/[0.03] px-2 py-1 text-sm outline-none focus:border-black/40 dark:border-white/15 dark:bg-black/30 dark:focus:border-white/40"
      />
      {query.trim() && (
        <div className="mt-1 max-h-40 overflow-y-auto rounded-md border border-black/10 dark:border-white/10">
          {candidates.length === 0 && (
            <p className="px-2 py-1.5 text-xs text-black/40 dark:text-white/40">No matching tasks</p>
          )}
          {candidates.map((t) => (
            <button
              key={t.id}
              onClick={() => {
                onChange([...value, t.id])
                setQuery('')
              }}
              className="block w-full px-2 py-1.5 text-left text-sm hover:bg-black/5 dark:hover:bg-white/5"
            >
              {t.title}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
