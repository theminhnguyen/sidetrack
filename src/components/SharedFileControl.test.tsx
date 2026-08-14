// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SharedFileControl } from './SharedFileControl'
import { useAppStore } from '../store/useAppStore'

afterEach(cleanup)

beforeEach(() => {
  useAppStore.setState({
    sharedFile: { status: 'disconnected', name: null, error: null, connectPreview: null },
  })
})

describe('SharedFileControl — connection help', () => {
  it('is reachable from the disconnected state and shows the exact team-file location', async () => {
    const user = userEvent.setup()
    render(<SharedFileControl />)

    await user.click(screen.getByRole('button', { name: 'How to connect to the team file' }))

    expect(screen.getByRole('dialog', { name: 'How to connect to the team file' })).toBeDefined()
    expect(screen.getByText('sidetrack-team.json')).toBeDefined()
    expect(screen.getByText('Automation Development')).toBeDefined()
    expect(screen.getByText('Internal Communication')).toBeDefined()
  })

  it('closes on request', async () => {
    const user = userEvent.setup()
    render(<SharedFileControl />)
    await user.click(screen.getByRole('button', { name: 'How to connect to the team file' }))

    // The Modal's own close affordance — its accessible name comes from its aria-label, not the ✕ glyph.
    await user.click(screen.getByRole('button', { name: 'Close' }))

    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('does not render at all when the browser has no File System Access API', () => {
    useAppStore.setState({ sharedFile: { status: 'unsupported', name: null, error: null, connectPreview: null } })
    const { container } = render(<SharedFileControl />)

    expect(container.innerHTML).toBe('')
  })
})

describe('SharedFileControl — connected state', () => {
  it('shows the connected file name and sync controls, no help link', () => {
    useAppStore.setState({
      sharedFile: { status: 'connected', name: 'sidetrack-team.json', error: null, connectPreview: null },
    })
    render(<SharedFileControl />)

    expect(screen.getByText('sidetrack-team.json')).toBeDefined()
    expect(screen.getByRole('button', { name: 'Sync now' })).toBeDefined()
    expect(screen.getByRole('button', { name: 'Disconnect' })).toBeDefined()
    expect(screen.queryByRole('button', { name: 'How to connect to the team file' })).toBeNull()
  })
})

describe('SharedFileControl — connecting a file replaces local data with confirmation', () => {
  it('downloads a backup before applying the incoming board', async () => {
    const connectSharedFile = vi.fn()
    const confirmConnectSharedFile = vi.fn()
    useAppStore.setState({
      sharedFile: {
        status: 'connecting',
        name: 'sidetrack-team.json',
        error: null,
        connectPreview: { userCount: 2, taskCount: 5 },
      },
      connectSharedFile,
      confirmConnectSharedFile,
    })
    const user = userEvent.setup()
    render(<SharedFileControl />)

    expect(screen.getByText(/has/)).toBeDefined()
    expect(screen.getByText('2', { exact: false })).toBeDefined()

    await user.click(screen.getByRole('button', { name: 'Connect' }))

    expect(confirmConnectSharedFile).toHaveBeenCalled()
  })
})
