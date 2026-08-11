import type { AuditLogEntry, Task, User } from '../types'

let counter = 0
function nextId(prefix: string): string {
  counter += 1
  return `${prefix}_${counter}`
}

export function makeTask(overrides: Partial<Task> = {}): Task {
  const now = '2026-07-01T00:00:00.000Z'
  return {
    id: nextId('t'),
    title: 'Task',
    description: '',
    deliverable: '',
    size: 'M',
    status: 'todo',
    assigneeId: null,
    startDate: '2026-07-01',
    dueDate: '2026-07-15',
    completedAt: null,
    milestones: [],
    comments: [],
    dependsOn: [],
    blockedReason: null,
    snoozeCount: 0,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

export function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: nextId('u'),
    name: 'User',
    initials: 'US',
    color: '#7C5CFF',
    capacity: { status: 'green', note: null, updatedAt: '2026-07-01T00:00:00.000Z' },
    active: true,
    ...overrides,
  }
}

export function makeAuditEntry(overrides: Partial<AuditLogEntry> = {}): AuditLogEntry {
  return {
    id: nextId('log'),
    taskId: null,
    timestamp: '2026-07-01T00:00:00.000Z',
    actorId: null,
    type: 'task_created',
    payload: {},
    ...overrides,
  }
}
