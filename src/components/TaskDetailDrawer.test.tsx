// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TaskDetailDrawer } from './TaskDetailDrawer'
import { useAppStore } from '../store/useAppStore'
import { createEmptyState } from '../types'
import { makeTask, makeUser } from '../lib/testFactory'

afterEach(cleanup)

const alex = makeUser({ id: 'u_alex', name: 'Alex Chen' })

function seedStore(tasks: ReturnType<typeof makeTask>[]) {
  useAppStore.setState({ ...createEmptyState(), users: [alex], tasks, currentUserId: null })
}

beforeEach(() => {
  useAppStore.setState({ cascadeSuggestion: null, cascadeAppliedNote: null, celebration: null })
})

describe('TaskDetailDrawer — draft state must not leak between tasks (PLAN-V2 P2.3)', () => {
  it('clears an unsaved due-date reason when the drawer switches to another task', async () => {
    // The original bug: type a reason for task A, don't save, open task B,
    // change B's date — A's reason was pre-filled and one click away from
    // being recorded as the justification for a change it had nothing to do with.
    const a = makeTask({ id: 't_a', title: 'Task A', startDate: '2026-08-01', dueDate: '2026-08-10' })
    const b = makeTask({ id: 't_b', title: 'Task B', startDate: '2026-08-01', dueDate: '2026-08-20' })
    seedStore([a, b])
    const user = userEvent.setup()

    const { rerender } = render(<TaskDetailDrawer taskId="t_a" onClose={() => {}} />)

    // Changing the date reveals the reason box; type into it but never save.
    const dueDateA = screen.getByDisplayValue('2026-08-10')
    await user.clear(dueDateA)
    await user.type(dueDateA, '2026-09-01')
    const reasonBox = await screen.findByPlaceholderText('e.g. Underestimated')
    await user.type(reasonBox, 'Leaked reason')
    expect((reasonBox as HTMLInputElement).value).toBe('Leaked reason')

    rerender(<TaskDetailDrawer taskId="t_b" onClose={() => {}} />)

    // Wait for the task-switch reset effect to land before judging it.
    expect(await screen.findByDisplayValue('2026-08-20')).toBeDefined()
    // B is untouched, so the reason box should not even be on screen.
    expect(screen.queryByPlaceholderText('e.g. Underestimated')).toBeNull()
  })

  it('shows the newly selected task\'s own values, not the previous one\'s drafts', async () => {
    const a = makeTask({ id: 't_a', title: 'Task A', startDate: '2026-08-01', dueDate: '2026-08-10' })
    const b = makeTask({ id: 't_b', title: 'Task B', startDate: '2026-08-05', dueDate: '2026-08-20' })
    seedStore([a, b])
    const user = userEvent.setup()

    const { rerender } = render(<TaskDetailDrawer taskId="t_a" onClose={() => {}} />)
    const title = screen.getByDisplayValue('Task A')
    await user.clear(title)
    await user.type(title, 'Half-typed rename')

    rerender(<TaskDetailDrawer taskId="t_b" onClose={() => {}} />)

    expect(screen.getByDisplayValue('Task B')).toBeDefined()
    expect(screen.queryByDisplayValue('Half-typed rename')).toBeNull()
  })
})

describe('TaskDetailDrawer — start date is reachable at all (PLAN-V2 P2.1)', () => {
  it('offers a start-date field, which used to exist only as a Gantt drag', () => {
    seedStore([makeTask({ id: 't_a', startDate: '2026-08-01', dueDate: '2026-08-10' })])
    render(<TaskDetailDrawer taskId="t_a" onClose={() => {}} />)
    expect(screen.getByDisplayValue('2026-08-01')).toBeDefined()
  })

  it('warns before a start date silently drags the due date along with it', async () => {
    seedStore([makeTask({ id: 't_a', startDate: '2026-08-01', dueDate: '2026-08-10' })])
    const user = userEvent.setup()
    render(<TaskDetailDrawer taskId="t_a" onClose={() => {}} />)

    const startDate = screen.getByDisplayValue('2026-08-01')
    await user.clear(startDate)
    await user.type(startDate, '2026-08-15')

    expect(await screen.findByText(/after the current due date/i)).toBeDefined()
  })
})

describe('TaskDetailDrawer — deleting asks first, in the app\'s own dialog', () => {
  it('does not delete on the first click', async () => {
    seedStore([makeTask({ id: 't_a', title: 'Task A' })])
    const user = userEvent.setup()
    render(<TaskDetailDrawer taskId="t_a" onClose={() => {}} />)

    await user.click(screen.getByRole('button', { name: 'Delete task' }))

    expect(useAppStore.getState().tasks).toHaveLength(1)
    expect(screen.getByRole('dialog', { name: 'Delete this task?' })).toBeDefined()
  })

  it('deletes once confirmed', async () => {
    seedStore([makeTask({ id: 't_a', title: 'Task A' })])
    const user = userEvent.setup()
    render(<TaskDetailDrawer taskId="t_a" onClose={() => {}} />)

    await user.click(screen.getByRole('button', { name: 'Delete task' }))
    await user.click(screen.getByRole('button', { name: 'Delete' }))

    expect(useAppStore.getState().tasks).toHaveLength(0)
  })
})
