import { useEffect, useRef, useState } from 'react'

const DURATION_MS = 420

/**
 * Counts from whatever is currently on screen to `value`. Reading the start
 * point from a ref (rather than the previous prop) means an interrupted run —
 * two tasks completed in quick succession — continues from where it stopped
 * instead of snapping back.
 */
export function CountUp({ value, className }: { value: number; className?: string }) {
  const [display, setDisplay] = useState(value)
  const displayRef = useRef(value)

  useEffect(() => {
    const from = displayRef.current
    if (from === value) return

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      displayRef.current = value
      setDisplay(value)
      return
    }

    let frame = 0
    const start = performance.now()
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / DURATION_MS)
      const eased = 1 - Math.pow(1 - t, 3)
      const next = Math.round(from + (value - from) * eased)
      displayRef.current = next
      setDisplay(next)
      if (t < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [value])

  return <span className={className}>{display}</span>
}
