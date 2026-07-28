import { useState } from 'react'
import { useAppStore } from '../store/useAppStore'
import { Popover } from './Popover'

const QUICK_REASONS = ['Day job', 'Waiting on others', 'Underestimated']

function SnoozePanel({ taskId, weeks, close }: { taskId: string; weeks: number; close: () => void }) {
  const task = useAppStore((s) => s.tasks.find((t) => t.id === taskId))
  const snoozeTask = useAppStore((s) => s.snoozeTask)
  const [reason, setReason] = useState('')
  const [shiftMilestones, setShiftMilestones] = useState(false)

  const hasOpenMilestones = task?.milestones.some((m) => !m.done) ?? false

  return (
    <div className="flex flex-col gap-2 text-sm">
      <p className="text-xs text-black/50 dark:text-white/50">Why is this moving by {weeks === 1 ? '1 week' : `${weeks} weeks`}?</p>
      <div className="flex flex-wrap gap-1.5">
        {QUICK_REASONS.map((r) => (
          <button
            key={r}
            onClick={() => setReason(r)}
            className={`rounded-full border px-2 py-1 text-xs ${
              reason === r
                ? 'border-black/40 bg-black/5 dark:border-white/40 dark:bg-white/10'
                : 'border-black/15 hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/5'
            }`}
          >
            {r}
          </button>
        ))}
      </div>
      <input
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Or type a reason…"
        className="w-full rounded-md border border-black/15 bg-black/[0.03] px-2 py-1 text-sm outline-none focus:border-black/40 dark:border-white/15 dark:bg-black/30 dark:focus:border-white/40"
      />
      {hasOpenMilestones && (
        <label className="flex items-center gap-2 text-xs text-black/60 dark:text-white/60">
          <input
            type="checkbox"
            checked={shiftMilestones}
            onChange={(e) => setShiftMilestones(e.target.checked)}
            className="h-3.5 w-3.5"
          />
          Also shift open milestones by the same amount
        </label>
      )}
      <button
        disabled={!reason.trim()}
        onClick={() => {
          snoozeTask(taskId, weeks, reason.trim(), shiftMilestones)
          close()
        }}
        className="mt-1 self-start rounded-md border border-black/20 bg-black/5 px-3 py-1 text-xs hover:bg-black/10 disabled:opacity-40 dark:border-white/20 dark:bg-white/10 dark:hover:bg-white/20"
      >
        Confirm +{weeks}w
      </button>
    </div>
  )
}

export function SnoozeButtons({ taskId, status }: { taskId: string; status: string }) {
  if (status === 'done') return null

  return (
    <div className="flex gap-1.5" onClick={(e) => e.stopPropagation()}>
      {[1, 2].map((weeks) => (
        <Popover
          key={weeks}
          trigger={(open) => (
            <button
              onClick={open}
              className="rounded-md border border-black/15 px-2 py-0.5 text-xs text-black/60 hover:bg-black/5 dark:border-white/15 dark:text-white/60 dark:hover:bg-white/10"
              title={`Snooze by ${weeks} week${weeks > 1 ? 's' : ''}`}
            >
              +{weeks}w
            </button>
          )}
        >
          {(close) => <SnoozePanel taskId={taskId} weeks={weeks} close={close} />}
        </Popover>
      ))}
    </div>
  )
}
