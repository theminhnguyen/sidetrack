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

export function CapacityDot({ status, className = '' }: { status: string; className?: string }) {
  const ring = CAPACITY_RING[status]
  return (
    <span
      className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${CAPACITY_DOT[status] ?? 'bg-black/20 dark:bg-white/30'} ${
        ring ? 'st-dot-pulse' : ''
      } ${className}`}
      style={ring ? { ['--st-ring' as string]: ring } : undefined}
      title={CAPACITY_LABEL[status] ?? status}
    />
  )
}
