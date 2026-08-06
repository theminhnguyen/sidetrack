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
    <div className="st-fade fixed inset-0 z-40 flex justify-end bg-black/60">
      <div
        onClick={onClose}
        className="absolute inset-0"
        aria-hidden="true"
      />
      <div className="st-slide-left relative h-full w-full max-w-lg overflow-y-auto border-l border-black/10 bg-white p-6 text-black shadow-2xl dark:border-white/15 dark:bg-[#14141f] dark:text-white">
        {children}
      </div>
    </div>
  )
}
