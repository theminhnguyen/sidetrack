// Single source of truth for the SideTrack data model. See PLAN.md §3.

export type CapacityStatus = 'green' | 'yellow' | 'red'

export type TaskSize = 'S' | 'M' | 'L' | 'XL'

export type TaskStatus = 'todo' | 'in_progress' | 'blocked' | 'done'

/** Calendar date, date-only, format YYYY-MM-DD. Never a Date object. */
export type DateOnly = string

/** ISO 8601 UTC timestamp string. */
export type Timestamp = string

export interface Capacity {
  status: CapacityStatus
  note: string | null
  updatedAt: Timestamp
}

export interface User {
  id: string
  name: string
  initials: string
  color: string
  capacity: Capacity
  active: boolean
}

export interface Milestone {
  id: string
  title: string
  dueDate: DateOnly
  done: boolean
}

export interface Task {
  id: string
  title: string
  description: string
  deliverable: string
  size: TaskSize
  status: TaskStatus
  assigneeId: string | null
  startDate: DateOnly
  dueDate: DateOnly
  completedAt: Timestamp | null
  milestones: Milestone[]
  dependsOn: string[]
  blockedReason: string | null
  snoozeCount: number
  createdAt: Timestamp
  updatedAt: Timestamp
}

export type AuditEventType =
  | 'task_created'
  | 'status_changed'
  | 'deadline_shifted'
  | 'milestone_shifted'
  | 'assignee_changed'
  | 'capacity_changed'

export interface AuditLogEntry {
  id: string
  taskId: string | null
  timestamp: Timestamp
  actorId: string | null
  type: AuditEventType
  payload: Record<string, unknown>
}

export interface AppSettings {
  lastDigestAt: Timestamp | null
  /** Set by exportJSON — drives the "back this up" nudge. See PLAN-V2.md P1. */
  lastExportAt: Timestamp | null
}

export interface AppState {
  schemaVersion: number
  users: User[]
  tasks: Task[]
  auditLog: AuditLogEntry[]
  settings: AppSettings
}

export const CURRENT_SCHEMA_VERSION = 2

export function createEmptyState(): AppState {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    users: [],
    tasks: [],
    auditLog: [],
    settings: {
      lastDigestAt: null,
      lastExportAt: null,
    },
  }
}
