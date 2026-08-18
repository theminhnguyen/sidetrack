import { useEffect, useState } from 'react'
import { useAppStore } from '../store/useAppStore'

/**
 * Whole-window drop target for the team file, so joining doesn't depend on
 * finding the file through the OS picker — which turned out to be the real
 * hurdle for teammates whose synced OneDrive folder is buried several levels
 * deep. A file dropped onto the page yields a genuine writable handle via
 * DataTransferItem.getAsFileSystemHandle(), the same kind the picker returns,
 * so the rest of the connect flow (preview, confirm, backup) is unchanged.
 *
 * Only active while disconnected: once connected there's nothing to drop, and
 * an always-live overlay would hijack unrelated drags across the whole app.
 */
export function SharedFileDropZone() {
  const status = useAppStore((s) => s.sharedFile.status)
  const connectSharedFileFromHandle = useAppStore((s) => s.connectSharedFileFromHandle)
  const [isDraggingFile, setIsDraggingFile] = useState(false)

  const armed = status === 'disconnected' || status === 'needs-reconnect'

  useEffect(() => {
    if (!armed) {
      setIsDraggingFile(false)
      return
    }

    // dragenter/dragleave fire for every element the pointer crosses, so a
    // naive boolean flickers badly. Counting entries against leaves is the
    // standard fix: only a balanced count means the drag really left.
    let depth = 0

    function hasFiles(e: DragEvent): boolean {
      return Array.from(e.dataTransfer?.types ?? []).includes('Files')
    }

    function onDragEnter(e: DragEvent) {
      if (!hasFiles(e)) return
      depth++
      setIsDraggingFile(true)
    }

    function onDragOver(e: DragEvent) {
      if (!hasFiles(e)) return
      // Without this the browser navigates away to the dropped file instead
      // of handing it to the page.
      e.preventDefault()
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
    }

    function onDragLeave(e: DragEvent) {
      if (!hasFiles(e)) return
      depth = Math.max(0, depth - 1)
      if (depth === 0) setIsDraggingFile(false)
    }

    function onDrop(e: DragEvent) {
      if (!hasFiles(e)) return
      e.preventDefault()
      depth = 0
      setIsDraggingFile(false)

      const item = e.dataTransfer?.items?.[0]
      if (!item || typeof item.getAsFileSystemHandle !== 'function') return
      // `items` is cleared once the event handler returns, so the handle must
      // be requested synchronously here — awaiting first would lose it.
      void item.getAsFileSystemHandle().then((handle) => {
        // Directories also produce a handle — only a file can be the team file.
        if (!handle || handle.kind !== 'file') return
        return connectSharedFileFromHandle(handle as FileSystemFileHandle)
      })
    }

    window.addEventListener('dragenter', onDragEnter)
    window.addEventListener('dragover', onDragOver)
    window.addEventListener('dragleave', onDragLeave)
    window.addEventListener('drop', onDrop)
    return () => {
      window.removeEventListener('dragenter', onDragEnter)
      window.removeEventListener('dragover', onDragOver)
      window.removeEventListener('dragleave', onDragLeave)
      window.removeEventListener('drop', onDrop)
    }
  }, [armed, connectSharedFileFromHandle])

  if (!armed || !isDraggingFile) return null

  return (
    <div className="st-fade pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-8">
      <div className="rounded-xl border-2 border-dashed border-white/70 px-10 py-8 text-center">
        <p className="text-lg font-semibold text-white">Drop the team file here</p>
        <p className="mt-1 text-sm text-white/70">sidetrack-team.json</p>
      </div>
    </div>
  )
}
