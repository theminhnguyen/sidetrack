import type { User } from '../types'

const CAPACITY_DOT: Record<string, string> = {
  green: 'bg-emerald-500',
  yellow: 'bg-amber-500',
  red: 'bg-rose-500',
}

const CAPACITY_LABEL: Record<string, string> = {
  green: 'Green — has capacity for side-projects',
  yellow: 'Yellow — limited capacity',
  red: 'Red — no capacity, day job in full swing',
}

/** Only the states that need attention pulse; green stays calm and static. */
const CAPACITY_RING: Record<string, string> = {
  yellow: 'rgba(245, 158, 11, 0.55)',
  red: 'rgba(244, 63, 94, 0.6)',
}

export function Avatar({ user, size = 'md' }: { user: User; size?: 'sm' | 'md' }) {
  const dims = size === 'sm' ? 'h-5 w-5 text-[10px]' : 'h-7 w-7 text-xs'
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-full font-semibold text-black/80 ${dims}`}
      style={{ backgroundColor: user.color }}
      title={user.name}
    >
      {user.initials}
    </span>
  )
}

/**
 * Red/amber/green is the single worst palette to encode meaning in: red-green
 * colour blindness affects roughly 8% of men, and this dot is the app's
 * central status signal. Each state therefore also carries a distinct glyph,
 * so it stays readable in greyscale — and on touch, where the `title`
 * tooltip never appears at all.
 */
const CAPACITY_GLYPH: Record<string, string> = {
  green: 'M2.5 5.2L4.3 7L7.5 3.4', // check — free
  yellow: 'M2.6 5H7.4', // bar — limited
  red: 'M3 3L7 7M7 3L3 7', // cross — unavailable
}

export function CapacityDot({
  status,
  stale = false,
  className = '',
}: {
  status: string
  /** Renders a hollow, muted dot: the value is old enough that it may no longer be true. */
  stale?: boolean
  className?: string
}) {
  const ring = CAPACITY_RING[status]
  const glyph = CAPACITY_GLYPH[status]
  const label = CAPACITY_LABEL[status] ?? status

  return (
    <span
      role="img"
      aria-label={stale ? `${label} (possibly out of date)` : label}
      title={stale ? `${label} — possibly out of date` : label}
      className={`inline-flex h-3 w-3 shrink-0 items-center justify-center rounded-full ${
        CAPACITY_DOT[status] ?? 'bg-black/20 dark:bg-white/30'
      } ${ring && !stale ? 'st-dot-pulse' : ''} ${stale ? 'opacity-40 ring-1 ring-black/30 dark:ring-white/40' : ''} ${className}`}
      style={ring && !stale ? { ['--st-ring' as string]: ring } : undefined}
    >
      {glyph && (
        <svg viewBox="0 0 10 10" className="h-2 w-2" aria-hidden="true">
          <path d={glyph} fill="none" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </span>
  )
}
