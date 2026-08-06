import { useEffect, useMemo } from 'react'
import { useAppStore } from '../store/useAppStore'

const COLORS = ['#7C5CFF', '#22c55e', '#0ea5e9', '#f97316', '#ec4899', '#eab308']
const PIECE_COUNT = 44
const LIFETIME_MS = 2400

interface Piece {
  left: number
  color: string
  dx: number
  rot: number
  dur: number
  delay: number
  width: number
  height: number
}

/**
 * Deterministic-per-burst confetti. Positions are generated once per
 * celebration (keyed on its timestamp) rather than on every render, so a
 * re-render mid-flight doesn't teleport the pieces.
 */
function buildPieces(): Piece[] {
  return Array.from({ length: PIECE_COUNT }, () => ({
    left: Math.random() * 100,
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
    dx: (Math.random() - 0.5) * 240,
    rot: 360 + Math.random() * 720,
    dur: 1.6 + Math.random() * 0.9,
    delay: Math.random() * 0.25,
    width: 6 + Math.random() * 5,
    height: 9 + Math.random() * 7,
  }))
}

export function Confetti() {
  const celebration = useAppStore((s) => s.celebration)
  const clearCelebration = useAppStore((s) => s.clearCelebration)

  // Respect the OS setting: no burst at all rather than a frozen pile of
  // rectangles, which is what `animation: none` alone would leave behind.
  const wantsMotion =
    typeof window === 'undefined' || !window.matchMedia('(prefers-reduced-motion: reduce)').matches

  const at = celebration?.at ?? null
  const pieces = useMemo(() => (at && wantsMotion ? buildPieces() : []), [at, wantsMotion])

  useEffect(() => {
    if (!celebration) return
    const timer = setTimeout(clearCelebration, LIFETIME_MS)
    return () => clearTimeout(timer)
  }, [celebration, clearCelebration])

  if (!celebration || !wantsMotion) return null

  return (
    <div className="pointer-events-none fixed inset-0 z-50 overflow-hidden" aria-hidden="true">
      {pieces.map((p, i) => (
        <span
          key={i}
          className="st-confetti-piece"
          style={{
            left: `${p.left}%`,
            width: `${p.width}px`,
            height: `${p.height}px`,
            backgroundColor: p.color,
            animationDelay: `${p.delay}s`,
            ['--st-dx' as string]: `${p.dx}px`,
            ['--st-rot' as string]: `${p.rot}deg`,
            ['--st-dur' as string]: `${p.dur}s`,
          }}
        />
      ))}
    </div>
  )
}
