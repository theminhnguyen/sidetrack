// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import { SharedFileDropZone } from './SharedFileDropZone'
import { useAppStore } from '../store/useAppStore'
import type { SharedFileStatus } from '../store/useAppStore'

afterEach(cleanup)

const connectSharedFileFromHandle = vi.fn(async () => {})

beforeEach(() => {
  connectSharedFileFromHandle.mockClear()
  useAppStore.setState({
    sharedFile: { status: 'disconnected', name: null, error: null, connectPreview: null },
    connectSharedFileFromHandle,
  })
})

/**
 * jsdom builds DragEvent without a dataTransfer, so each test supplies its
 * own — only the three members this component actually reads (`types`,
 * `items`, `dropEffect`).
 */
function fireDrag(type: string, { types = ['Files'], handle = undefined as unknown, kind = 'file' } = {}) {
  const event = new Event(type, { bubbles: true, cancelable: true }) as DragEvent
  Object.defineProperty(event, 'dataTransfer', {
    value: {
      types,
      dropEffect: 'none',
      items: handle === undefined ? [] : [{ getAsFileSystemHandle: async () => handle, kind }],
    },
  })
  act(() => {
    window.dispatchEvent(event)
  })
  return event
}

describe('SharedFileDropZone — overlay visibility', () => {
  it('appears when a file is dragged over the page', () => {
    render(<SharedFileDropZone />)
    expect(screen.queryByText('Drop the team file here')).toBeNull()

    fireDrag('dragenter')

    expect(screen.getByText('Drop the team file here')).toBeDefined()
  })

  it('ignores drags that carry no files (e.g. selected text)', () => {
    render(<SharedFileDropZone />)

    fireDrag('dragenter', { types: ['text/plain'] })

    expect(screen.queryByText('Drop the team file here')).toBeNull()
  })

  it('stays visible while the drag crosses nested elements, and hides only when it really leaves', () => {
    // Regression guard: dragenter/dragleave fire per element crossed, so a
    // naive boolean flickers the overlay off mid-drag.
    render(<SharedFileDropZone />)

    fireDrag('dragenter')
    fireDrag('dragenter') // entered a child element
    fireDrag('dragleave') // left the child, still over the page
    expect(screen.getByText('Drop the team file here')).toBeDefined()

    fireDrag('dragleave') // now actually left
    expect(screen.queryByText('Drop the team file here')).toBeNull()
  })

  it.each<SharedFileStatus>(['connected', 'connecting', 'conflict'])(
    'does not arm while status is %s — there is nothing to connect',
    (status) => {
      useAppStore.setState({ sharedFile: { status, name: 'team.json', error: null, connectPreview: null } })
      render(<SharedFileDropZone />)

      fireDrag('dragenter')

      expect(screen.queryByText('Drop the team file here')).toBeNull()
    },
  )
})

describe('SharedFileDropZone — dropping', () => {
  it('hands a dropped file handle to the same connect flow the picker uses', async () => {
    render(<SharedFileDropZone />)
    const fakeHandle = { kind: 'file', name: 'sidetrack-team.json' }

    fireDrag('dragenter')
    fireDrag('drop', { handle: fakeHandle })
    await act(async () => {})

    expect(connectSharedFileFromHandle).toHaveBeenCalledWith(fakeHandle)
    expect(screen.queryByText('Drop the team file here')).toBeNull()
  })

  it('prevents the default so the browser does not navigate away to the file', () => {
    render(<SharedFileDropZone />)
    fireDrag('dragenter')

    const event = fireDrag('drop', { handle: { kind: 'file' } })

    expect(event.defaultPrevented).toBe(true)
  })

  it('ignores a dropped folder — only a file can be the team file', async () => {
    render(<SharedFileDropZone />)

    fireDrag('dragenter')
    fireDrag('drop', { handle: { kind: 'directory', name: 'internals' } })
    await act(async () => {})

    expect(connectSharedFileFromHandle).not.toHaveBeenCalled()
  })

  it('ignores a drop the browser gave no handle for', async () => {
    render(<SharedFileDropZone />)

    fireDrag('dragenter')
    fireDrag('drop', { handle: null })
    await act(async () => {})

    expect(connectSharedFileFromHandle).not.toHaveBeenCalled()
  })
})
