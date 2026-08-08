// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { TaskCard } from './TaskCard'
import { makeTask, makeUser } from '../lib/testFactory'

afterEach(cleanup)

const FLASH_SELECTOR = '.st-flash'

/**
 * The status flash shipped broken twice — first it never fired at all
 * (the previous-status comparison could not work, because a status change
 * remounts the card into a different column), then the fix made *every*
 * card flash on a first visit (seeded tasks all carry the current time).
 * Both were caught by hand in the browser. Pinned here.
 */
describe('TaskCard — arrival flash', () => {
  it('does not flash on the board\'s very first render, even for a just-touched task', () => {
    const task = makeTask({ updatedAt: new Date().toISOString() })
    const { container } = render(
      <TaskCard task={task} assignee={undefined} conflicted={false} allowFlash={false} onClick={() => {}} />,
    )
    expect(container.querySelector(FLASH_SELECTOR)).toBeNull()
  })

  it('flashes for a card that arrived moments ago once the board has painted', () => {
    const task = makeTask({ updatedAt: new Date().toISOString() })
    const { container } = render(
      <TaskCard task={task} assignee={undefined} conflicted={false} allowFlash onClick={() => {}} />,
    )
    expect(container.querySelector(FLASH_SELECTOR)).not.toBeNull()
  })

  it('does not flash for a card that has been sitting in its column', () => {
    const task = makeTask({ updatedAt: '2020-01-01T12:00:00.000Z' })
    const { container } = render(
      <TaskCard task={task} assignee={undefined} conflicted={false} allowFlash onClick={() => {}} />,
    )
    expect(container.querySelector(FLASH_SELECTOR)).toBeNull()
  })

  it('re-flashes an already-mounted card when it is edited in place', () => {
    // Snoozing or reassigning doesn't move the card between columns, so it
    // stays mounted — without watching updatedAt it would acknowledge nothing.
    const task = makeTask({ updatedAt: '2020-01-01T12:00:00.000Z' })
    const { container, rerender } = render(
      <TaskCard task={task} assignee={undefined} conflicted={false} allowFlash onClick={() => {}} />,
    )
    expect(container.querySelector(FLASH_SELECTOR)).toBeNull()

    rerender(
      <TaskCard
        task={{ ...task, updatedAt: new Date().toISOString() }}
        assignee={undefined}
        conflicted={false}
        allowFlash
        onClick={() => {}}
      />,
    )

    expect(container.querySelector(FLASH_SELECTOR)).not.toBeNull()
  })
})

describe('TaskCard — assignee is named, not just initialled', () => {
  it('shows the full name, so a report reader never has to decode "AC"', () => {
    const assignee = makeUser({ name: 'Alex Chen', initials: 'AC' })
    render(<TaskCard task={makeTask()} assignee={assignee} conflicted={false} onClick={() => {}} />)
    expect(screen.getByText('Alex Chen')).toBeDefined()
  })
})

describe('TaskCard — capacity light is readable without colour', () => {
  it('labels the light for assistive tech instead of relying on the dot alone', () => {
    const assignee = makeUser({
      name: 'Alex Chen',
      capacity: { status: 'red', note: null, updatedAt: new Date().toISOString() },
    })
    render(<TaskCard task={makeTask()} assignee={assignee} conflicted={false} onClick={() => {}} />)
    expect(screen.getByRole('img', { name: /no capacity/i })).toBeDefined()
  })

  it('says so when the light is old enough to distrust', () => {
    const assignee = makeUser({
      name: 'Alex Chen',
      capacity: { status: 'green', note: null, updatedAt: '2020-01-01T12:00:00.000Z' },
    })
    render(<TaskCard task={makeTask()} assignee={assignee} conflicted={false} onClick={() => {}} />)
    expect(screen.getByRole('img', { name: /possibly out of date/i })).toBeDefined()
  })
})

describe('TaskCard — overdue', () => {
  it('marks a not-done task past its due date', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 7, 15, 12))
    try {
      const task = makeTask({ status: 'in_progress', dueDate: '2026-08-01' })
      render(<TaskCard task={task} assignee={undefined} conflicted={false} onClick={() => {}} />)
      const due = screen.getByText(/^Due /)
      expect(due.className).toContain('text-rose-600')
    } finally {
      vi.useRealTimers()
    }
  })
})
