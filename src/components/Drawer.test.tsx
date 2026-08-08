// @vitest-environment jsdom
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Drawer } from './Drawer'
import { Modal } from './Modal'

afterEach(cleanup)

/**
 * Every dialog defect fixed in PLAN-V2 P3 was found by clicking around in a
 * browser, not by a test — which is exactly why they could exist. These pin
 * the behaviour so the next change to useDialogA11y can't quietly undo it.
 */
describe('Drawer — dialog semantics', () => {
  it('announces itself as a modal dialog', () => {
    render(
      <Drawer onClose={() => {}}>
        <button>Inside</button>
      </Drawer>,
    )
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveProperty('ariaModal', 'true')
  })

  it('moves focus into the dialog on open, instead of leaving it on the page behind', async () => {
    render(
      <Drawer onClose={() => {}}>
        <button>First</button>
        <button>Second</button>
      </Drawer>,
    )
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'First' }))
  })

  it('restores focus to whatever opened it once it closes', async () => {
    function Harness() {
      const [open, setOpen] = useState(false)
      return (
        <>
          <button onClick={() => setOpen(true)}>Open drawer</button>
          {open && (
            <Drawer onClose={() => setOpen(false)}>
              <button onClick={() => setOpen(false)}>Close</button>
            </Drawer>
          )}
        </>
      )
    }
    const user = userEvent.setup()
    render(<Harness />)
    const opener = screen.getByRole('button', { name: 'Open drawer' })

    await user.click(opener)
    await user.click(screen.getByRole('button', { name: 'Close' }))

    expect(document.activeElement).toBe(opener)
  })

  it('traps Tab inside the dialog — shift+tab from the first control wraps to the last', async () => {
    const user = userEvent.setup()
    render(
      <Drawer onClose={() => {}}>
        <button>First</button>
        <button>Middle</button>
        <button>Last</button>
      </Drawer>,
    )
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'First' }))

    await user.tab({ shift: true })

    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Last' }))
  })

  it('closes on Escape', async () => {
    const onClose = vi.fn()
    const user = userEvent.setup()
    render(
      <Drawer onClose={onClose}>
        <button>Inside</button>
      </Drawer>,
    )

    await user.keyboard('{Escape}')

    expect(onClose).toHaveBeenCalledTimes(1)
  })
})

describe('nested dialogs — Escape closes only the topmost (PLAN-V2 P3 regression)', () => {
  it('leaves the drawer open when Escape dismisses a modal opened from inside it', async () => {
    // The original bug: both dialogs registered their own document-level
    // Escape listener, so one keypress closed the modal *and* the drawer
    // underneath it. Found by hand in the browser; pinned here.
    const onDrawerClose = vi.fn()
    const onModalClose = vi.fn()
    const user = userEvent.setup()

    render(
      <Drawer onClose={onDrawerClose}>
        <button>Drawer control</button>
        <Modal title="Confirm" onClose={onModalClose}>
          <button>Modal control</button>
        </Modal>
      </Drawer>,
    )

    await user.keyboard('{Escape}')

    expect(onModalClose).toHaveBeenCalledTimes(1)
    expect(onDrawerClose).not.toHaveBeenCalled()
  })
})
