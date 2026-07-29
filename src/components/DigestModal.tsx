import { useMemo, useState } from 'react'
import { useAppStore } from '../store/useAppStore'
import { buildDigest, formatDigestText } from '../lib/digest'
import { nowTimestamp } from '../lib/dates'
import { Modal } from './Modal'

export function DigestModal({ onClose }: { onClose: () => void }) {
  const tasks = useAppStore((s) => s.tasks)
  const users = useAppStore((s) => s.users)
  const auditLog = useAppStore((s) => s.auditLog)
  const settings = useAppStore((s) => s.settings)
  const schemaVersion = useAppStore((s) => s.schemaVersion)
  const setLastDigestAt = useAppStore((s) => s.setLastDigestAt)
  const [copied, setCopied] = useState(false)
  const [baselineUpdated, setBaselineUpdated] = useState(false)

  const text = useMemo(
    () => formatDigestText(buildDigest({ schemaVersion, users, tasks, auditLog, settings })),
    [schemaVersion, users, tasks, auditLog, settings],
  )

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  function handleMarkBaseline() {
    setLastDigestAt(nowTimestamp())
    setBaselineUpdated(true)
  }

  return (
    <Modal title="Status report" onClose={onClose} wide>
      <pre className="max-h-96 overflow-y-auto whitespace-pre-wrap rounded-md border border-black/15 bg-black/[0.03] p-3 text-sm dark:border-white/15 dark:bg-black/30">
        {text}
      </pre>

      <div className="mt-4 flex items-center justify-between">
        <button
          onClick={handleCopy}
          className="rounded-md border border-black/20 bg-black/5 px-3 py-1.5 text-sm hover:bg-black/10 dark:border-white/20 dark:bg-white/10 dark:hover:bg-white/20"
        >
          {copied ? 'Copied ✓' : 'Copy to clipboard'}
        </button>

        {baselineUpdated ? (
          <span className="text-sm text-emerald-700 dark:text-emerald-400">Baseline updated ✓</span>
        ) : (
          <button
            onClick={handleMarkBaseline}
            className="text-sm text-black/60 underline hover:text-black dark:text-white/60 dark:hover:text-white"
          >
            Mark this as the new report baseline?
          </button>
        )}
      </div>
    </Modal>
  )
}
