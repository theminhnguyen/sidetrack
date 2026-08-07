import { describe, expect, it } from 'vitest'
import { formatAuditEntry } from './auditFormat'
import { makeAuditEntry, makeTask } from './testFactory'

describe('formatAuditEntry — milestone_shifted (PLAN-V2 P2.2)', () => {
  it('includes the reason clause when a reason was given', () => {
    const task = makeTask({ milestones: [{ id: 'm_1', title: 'Draft ready', dueDate: '2026-08-05', done: false }] })
    const entry = makeAuditEntry({
      type: 'milestone_shifted',
      taskId: task.id,
      payload: { milestoneId: 'm_1', from: '2026-08-01', to: '2026-08-05', reason: 'Slipped a few days' },
    })
    expect(formatAuditEntry(entry, [], task)).toBe(
      'Someone moved milestone "Draft ready" from Aug 1 to Aug 5 — "Slipped a few days"',
    )
  })

  it('omits the reason clause entirely when none was given (inline drawer edits never prompt for one)', () => {
    const task = makeTask({ milestones: [{ id: 'm_1', title: 'Draft ready', dueDate: '2026-08-05', done: false }] })
    const entry = makeAuditEntry({
      type: 'milestone_shifted',
      taskId: task.id,
      payload: { milestoneId: 'm_1', from: '2026-08-01', to: '2026-08-05', reason: '' },
    })
    expect(formatAuditEntry(entry, [], task)).toBe('Someone moved milestone "Draft ready" from Aug 1 to Aug 5')
  })
})
