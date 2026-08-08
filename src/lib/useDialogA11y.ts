import { useEffect, useRef, type RefObject } from 'react'

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * Asks the question directly (is this painted?) rather than inferring it from
 * `offsetParent`, which is a layout side-channel: it is always null in a
 * layout-less environment like jsdom, which would silently disable the whole
 * trap under test, and it is also null for fixed-position elements in some
 * engines.
 */
function isVisible(el: HTMLElement): boolean {
  if (el.hidden || el.getAttribute('aria-hidden') === 'true') return false
  const style = getComputedStyle(el)
  return style.display !== 'none' && style.visibility !== 'hidden'
}

function focusableIn(container: HTMLElement): HTMLElement[] {
  // Recomputed on every Tab press rather than cached at mount — a dialog's
  // content changes as the user interacts with it (e.g. TaskDetailDrawer's
  // reason boxes appear/disappear), so a one-time snapshot would go stale.
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(isVisible)
}

interface OpenDialog {
  id: symbol
  getContainer: () => HTMLElement | null
}

/**
 * Every currently-open dialog — lets Escape close only the one on top.
 * Without this, opening the delete-confirmation Modal from inside the
 * TaskDetailDrawer meant a single Escape press closed *both*: each dialog
 * owns a document-level keydown listener, and both fire on the same keypress.
 */
let openDialogs: OpenDialog[] = []

/**
 * Mount order alone is not enough to decide what's on top: React runs child
 * effects before parent effects, so a dialog rendered inside another one
 * registers *first* and would make the outer dialog look topmost. Containment
 * is therefore checked before falling back to "most recently opened".
 */
function topmostDialogId(): symbol | null {
  const withoutAncestors = openDialogs.filter((dialog) => {
    const el = dialog.getContainer()
    if (!el) return true
    return !openDialogs.some((other) => {
      if (other.id === dialog.id) return false
      const otherEl = other.getContainer()
      return otherEl !== null && el.contains(otherEl)
    })
  })
  const pool = withoutAncestors.length > 0 ? withoutAncestors : openDialogs
  return pool[pool.length - 1]?.id ?? null
}

/**
 * Standard modal/dialog accessibility, shared by Modal and Drawer (see
 * PLAN-V2.md P3): Escape closes the topmost dialog, focus moves into the
 * dialog on open and is trapped there while it's open, and is restored to
 * whatever had focus before the dialog opened once it closes.
 */
export function useDialogA11y(containerRef: RefObject<HTMLElement | null>, onClose: () => void) {
  const idRef = useRef<symbol>(undefined)
  if (idRef.current === undefined) idRef.current = Symbol('dialog')

  useEffect(() => {
    const id = idRef.current!
    openDialogs.push({ id, getContainer: () => containerRef.current })
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null

    const container = containerRef.current
    if (container) {
      const items = focusableIn(container)
      ;(items[0] ?? container).focus()
    }

    function onKeyDown(e: KeyboardEvent) {
      const isTopmost = topmostDialogId() === id

      if (e.key === 'Escape') {
        if (isTopmost) onClose()
        return
      }
      if (e.key !== 'Tab' || !container || !isTopmost) return

      const items = focusableIn(container)
      if (items.length === 0) return
      const first = items[0]
      const last = items[items.length - 1]

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      openDialogs = openDialogs.filter((dialog) => dialog.id !== id)
      previouslyFocused?.focus()
    }
    // containerRef is a ref (stable identity), not reactive data — only
    // onClose needs to be a dependency, matching the effect it replaces.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [onClose])
}
