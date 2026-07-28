import { useEffect, type ReactNode } from 'react'

interface DrawerProps {
  onClose: () => void
  children: ReactNode
}

export function Drawer({ onClose, children }: DrawerProps) {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/60">
      <div
        onClick={onClose}
        className="absolute inset-0"
        aria-hidden="true"
      />
      <div className="relative h-full w-full max-w-lg overflow-y-auto border-l border-white/15 bg-[#14141f] p-6 shadow-2xl">
        {children}
      </div>
    </div>
  )
}
