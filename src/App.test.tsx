// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from './App'
import { useAppStore } from './store/useAppStore'
import { createEmptyState } from './types'
import { makeTask } from './lib/testFactory'

afterEach(cleanup)

// jsdom has no matchMedia implementation — first test in the suite to render
// the full <App/> tree, which pulls in <ThemeToggle/>'s system-theme check.
beforeEach(() => {
  window.matchMedia ??= ((query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList) as typeof window.matchMedia
})

function seedStore(overrides: Partial<ReturnType<typeof useAppStore.getState>> = {}) {
  useAppStore.setState({
    ...createEmptyState(),
    users: [],
    tasks: [],
    currentUserId: null,
    sharedFile: { status: 'disconnected', name: null, error: null, connectPreview: null },
    ...overrides,
  })
}

describe('App — manual JSON import/export is gone (live-only editing)', () => {
  it('has no Export JSON, Import JSON, or Export a backup affordance anywhere', () => {
    seedStore({ tasks: [makeTask()] })
    render(<App />)

    expect(screen.queryByRole('button', { name: 'Export JSON' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Import JSON' })).toBeNull()
    expect(screen.queryByText(/export a backup/i)).toBeNull()
  })
})

describe('App — connect nudge (replaces the old export nudge)', () => {
  it('shows once there are tasks and no team file is connected', () => {
    seedStore({ tasks: [makeTask()] })
    render(<App />)

    expect(screen.getByText(/Connect the team file/)).toBeDefined()
  })

  it('stays quiet on an empty board — nothing worth backing up yet', () => {
    seedStore({ tasks: [] })
    render(<App />)

    expect(screen.queryByText(/lives only in this browser/)).toBeNull()
  })

  it('disappears once the team file is connected', () => {
    seedStore({
      tasks: [makeTask()],
      sharedFile: { status: 'connected', name: 'sidetrack-team.json', error: null, connectPreview: null },
    })
    render(<App />)

    expect(screen.queryByText(/lives only in this browser/)).toBeNull()
  })

  it('names the browser requirement specifically when this browser cannot connect at all', () => {
    seedStore({
      tasks: [makeTask()],
      sharedFile: { status: 'unsupported', name: null, error: null, connectPreview: null },
    })
    render(<App />)

    // Matches both this nudge and SharedFileControl's own header hint — the
    // "no backup beyond this device" clause is unique to the nudge banner.
    expect(screen.getByText(/no backup beyond this device/)).toBeDefined()
  })

  it('can be dismissed', async () => {
    seedStore({ tasks: [makeTask()] })
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'Dismiss' }))

    expect(screen.queryByText(/Connect the team file/)).toBeNull()
  })
})

describe('App — save-error message reflects whether a team file has a copy', () => {
  it('reassures that changes still reach the team file when connected', () => {
    seedStore({
      saveError: true,
      sharedFile: { status: 'connected', name: 'sidetrack-team.json', error: null, connectPreview: null },
    })
    render(<App />)

    expect(screen.getByText(/still syncing to the team file/)).toBeDefined()
  })

  it('warns that changes may not survive a reload when nothing is connected', () => {
    seedStore({ saveError: true })
    render(<App />)

    expect(screen.getByText(/may not survive a reload/)).toBeDefined()
  })
})
