import { useAppStore } from '../store/useAppStore'
import { formatDateOnly } from '../lib/dates'

export function CascadeToast() {
  const suggestion = useAppStore((s) => s.cascadeSuggestion)
  const confirm = useAppStore((s) => s.confirmCascadeSuggestion)
  const dismiss = useAppStore((s) => s.dismissCascadeSuggestion)
  const appliedNote = useAppStore((s) => s.cascadeAppliedNote)
  const dismissAppliedNote = useAppStore((s) => s.dismissCascadeAppliedNote)

  if (suggestion) {
    return (
      <div className="st-toast fixed bottom-6 right-6 z-50 w-80 rounded-lg border border-amber-500/40 bg-white p-4 text-black shadow-2xl dark:border-amber-500/30 dark:bg-[#1a1a26] dark:text-white">
        <p className="text-sm">
          Moving <strong>{suggestion.rootTitle}</strong> puts {suggestion.plan.length} dependent{' '}
          {suggestion.plan.length === 1 ? 'task' : 'tasks'} in conflict.
        </p>
        <ul className="mt-2 space-y-1 text-xs text-black/60 dark:text-white/60">
          {suggestion.plan.map((s) => (
            <li key={s.taskId}>
              {s.title}: {formatDateOnly(s.from)} → {formatDateOnly(s.to)}
            </li>
          ))}
        </ul>
        <div className="mt-3 flex gap-2">
          <button
            onClick={confirm}
            className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-1 text-xs hover:bg-amber-500/20"
          >
            Shift them too
          </button>
          <button onClick={dismiss} className="rounded-md px-3 py-1 text-xs text-black/50 hover:text-black dark:text-white/50 dark:hover:text-white">
            Not now
          </button>
        </div>
      </div>
    )
  }

  // Some (or all) of a just-confirmed plan turned out to be stale — see
  // confirmCascadeSuggestion. Worth a beat of visibility, not a full toast.
  if (appliedNote) {
    return (
      <div className="st-toast fixed bottom-6 right-6 z-50 w-80 rounded-lg border border-black/15 bg-white p-3 text-sm text-black shadow-2xl dark:border-white/15 dark:bg-[#1a1a26] dark:text-white">
        <p>{appliedNote}</p>
        <button
          onClick={dismissAppliedNote}
          className="mt-2 rounded-md px-2 py-1 text-xs text-black/50 hover:text-black dark:text-white/50 dark:hover:text-white"
        >
          Dismiss
        </button>
      </div>
    )
  }

  return null
}
