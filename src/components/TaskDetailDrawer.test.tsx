// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
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

describe('TaskDetailDrawer — adding a milestone (reported as "doesn\'t work")', () => {
  it('adds it to the list and records it in History, typed name and all', async () => {
    seedStore([makeTask({ id: 't_a', title: 'Task A' })])
    const user = userEvent.setup()
    render(<TaskDetailDrawer taskId="t_a" onClose={() => {}} />)

    await user.type(screen.getByPlaceholderText('New milestone…'), 'Launch beta')
    await user.click(screen.getByRole('button', { name: 'Add' }))

    expect(useAppStore.getState().tasks[0].milestones).toHaveLength(1)
    expect(useAppStore.getState().tasks[0].milestones[0].title).toBe('Launch beta')
    // The name-field input itself doubles as the on-screen proof it landed.
    expect(screen.getByDisplayValue('Launch beta')).toBeDefined()
    // ...and History confirms it too — previously silent for this action,
    // which is the most likely reason it *felt* broken even though the
    // underlying store update always worked.
    expect(await screen.findByText(/added milestone "Launch beta"/)).toBeDefined()
  })

  it('clears the name field but keeps it usable for the next one', async () => {
    seedStore([makeTask({ id: 't_a', title: 'Task A' })])
    const user = userEvent.setup()
    render(<TaskDetailDrawer taskId="t_a" onClose={() => {}} />)

    const input = screen.getByPlaceholderText('New milestone…')
    await user.type(input, 'Launch beta')
    await user.click(screen.getByRole('button', { name: 'Add' }))

    expect((input as HTMLInputElement).value).toBe('')
  })

  it('does not leak an unsaved milestone draft into the next task opened (same class as PLAN-V2 P2.3)', async () => {
    const a = makeTask({ id: 't_a', title: 'Task A' })
    const b = makeTask({ id: 't_b', title: 'Task B' })
    seedStore([a, b])
    const user = userEvent.setup()

    const { rerender } = render(<TaskDetailDrawer taskId="t_a" onClose={() => {}} />)
    await user.type(screen.getByPlaceholderText('New milestone…'), 'Half-typed for A')

    rerender(<TaskDetailDrawer taskId="t_b" onClose={() => {}} />)

    // Wait for the task-switch reset effect to land before judging it.
    expect(await screen.findByDisplayValue('Task B')).toBeDefined()
    expect((screen.getByPlaceholderText('New milestone…') as HTMLInputElement).value).toBe('')
  })
})

describe('TaskDetailDrawer — renaming a milestone (reported as impossible)', () => {
  it('lets the milestone\'s name be edited after creation, not just at creation', async () => {
    const task = makeTask({
      id: 't_a',
      milestones: [{ id: 'm_1', title: 'Draft ready', dueDate: '2026-08-01', done: false }],
    })
    seedStore([task])
    const user = userEvent.setup()
    render(<TaskDetailDrawer taskId="t_a" onClose={() => {}} />)

    const nameField = screen.getByDisplayValue('Draft ready')
    await user.clear(nameField)
    await user.type(nameField, 'First draft ready')
    await user.tab()

    expect(useAppStore.getState().tasks[0].milestones[0].title).toBe('First draft ready')
  })

  it('snaps back to the stored name instead of saving a blank one', async () => {
    const task = makeTask({
      id: 't_a',
      milestones: [{ id: 'm_1', title: 'Draft ready', dueDate: '2026-08-01', done: false }],
    })
    seedStore([task])
    const user = userEvent.setup()
    render(<TaskDetailDrawer taskId="t_a" onClose={() => {}} />)

    const nameField = screen.getByDisplayValue('Draft ready')
    await user.clear(nameField)
    await user.tab()

    expect(useAppStore.getState().tasks[0].milestones[0].title).toBe('Draft ready')
    expect(screen.getByDisplayValue('Draft ready')).toBeDefined()
  })
})

describe('TaskDetailDrawer — comments (Jira-style status notes)', () => {
  it('posts a comment and shows it immediately, with an author and timestamp', async () => {
    seedStore([makeTask({ id: 't_a', title: 'Task A' })])
    useAppStore.setState({ currentUserId: 'u_alex' })
    const user = userEvent.setup()
    render(<TaskDetailDrawer taskId="t_a" onClose={() => {}} />)

    await user.type(screen.getByPlaceholderText('Leave a status update…'), 'Trials starting Monday.')
    await user.click(screen.getByRole('button', { name: 'Comment' }))

    expect(useAppStore.getState().tasks[0].comments).toHaveLength(1)
    const body = await screen.findByText('Trials starting Monday.')
    expect(within(body.closest('li')!).getByText('Alex Chen')).toBeDefined()
  })

  it('cannot submit an empty comment', async () => {
    seedStore([makeTask({ id: 't_a', title: 'Task A' })])
    render(<TaskDetailDrawer taskId="t_a" onClose={() => {}} />)

    expect(screen.getByRole('button', { name: 'Comment' })).toHaveProperty('disabled', true)
  })

  it('deletes a comment', async () => {
    const task = makeTask({
      id: 't_a',
      comments: [{ id: 'c_1', body: 'Old note', authorId: null, createdAt: '2026-07-01T00:00:00.000Z' }],
    })
    seedStore([task])
    const user = userEvent.setup()
    render(<TaskDetailDrawer taskId="t_a" onClose={() => {}} />)

    await user.click(screen.getByRole('button', { name: 'Delete comment' }))

    expect(useAppStore.getState().tasks[0].comments).toEqual([])
    expect(screen.queryByText('Old note')).toBeNull()
  })
})
