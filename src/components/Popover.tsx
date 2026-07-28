import { useEffect, useRef, useState, type ReactNode } from 'react'

interface PopoverProps {
  trigger: (open: () => void) => ReactNode
  children: (close: () => void) => ReactNode
  align?: 'left' | 'right'
}

export function Popover({ trigger, children, align = 'left' }: PopoverProps) {
  const [isOpen, setIsOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isOpen) return
    function onPointerDown(e: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setIsOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [isOpen])

  return (
    <div className="relative inline-block" ref={rootRef}>
      {trigger(() => setIsOpen((v) => !v))}
      {isOpen && (
        <div
          className={`absolute z-20 mt-2 min-w-64 rounded-lg border border-white/15 bg-[#1a1a26] p-3 shadow-xl ${
            align === 'right' ? 'right-0' : 'left-0'
          }`}
        >
          {children(() => setIsOpen(false))}
        </div>
      )}
    </div>
  )
}
