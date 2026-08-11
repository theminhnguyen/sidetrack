import { type AppState, type Task, type User, CURRENT_SCHEMA_VERSION } from '../types'
import { createId } from '../lib/id'
import { addDaysToDateOnly, nowTimestamp, parseDateOnly, today } from '../lib/dates'

/** Dev/demo seed data — 3 users, 6 tasks, used on first run only. */
export function seedState(): AppState {
  const now = nowTimestamp()

  const alex: User = {
    id: createId('u'),
    name: 'Alex Chen',
    initials: 'AC',
    color: '#7C5CFF',
    capacity: { status: 'yellow', note: 'Quarter-end reporting until Aug 8', updatedAt: now },
    active: true,
  }
  const priya: User = {
    id: createId('u'),
    name: 'Priya Nair',
    initials: 'PN',
    color: '#22c55e',
    capacity: { status: 'green', note: null, updatedAt: now },
    active: true,
  }
  const jonas: User = {
    id: createId('u'),
    name: 'Jonas Weber',
    initials: 'JW',
    color: '#f97316',
    capacity: { status: 'red', note: 'Incident response this week', updatedAt: now },
    active: true,
  }

  const users = [alex, priya, jonas]

  const ocrVendor: Task = {
    id: createId('t'),
    title: 'Vendor comparison for OCR service',
    description: 'Compare 3-5 OCR vendors on price, quality, compliance.',
    deliverable: 'One-pager with a clear recommendation, posted in the team channel',
    size: 'M',
    status: 'in_progress',
    assigneeId: alex.id,
    startDate: addDaysToDateOnly(today(), -3),
    dueDate: addDaysToDateOnly(today(), 3),
    completedAt: null,
    milestones: [
      { id: createId('m'), title: 'Shortlist of 3 vendors', dueDate: addDaysToDateOnly(today(), -1), done: true },
      { id: createId('m'), title: 'Trial accounts evaluated', dueDate: addDaysToDateOnly(today(), 2), done: false },
    ],
    comments: [
      {
        id: createId('c'),
        body: 'Two vendors dropped out over pricing — down to a shortlist of 3, trials starting this week.',
        authorId: alex.id,
        createdAt: now,
      },
    ],
    dependsOn: [],
    blockedReason: null,
    snoozeCount: 0,
    createdAt: now,
    updatedAt: now,
  }

  const ocrRollout: Task = {
    id: createId('t'),
    title: 'Roll out chosen OCR vendor to prod',
    description: 'Wire the selected vendor into the invoicing pipeline.',
    deliverable: 'OCR vendor live behind a feature flag',
    size: 'L',
    status: 'todo',
    assigneeId: priya.id,
    startDate: addDaysToDateOnly(today(), 3),
    dueDate: addDaysToDateOnly(today(), 14),
    completedAt: null,
    milestones: [],
    comments: [],
    dependsOn: [ocrVendor.id],
    blockedReason: null,
    snoozeCount: 0,
    createdAt: now,
    updatedAt: now,
  }

  const internalWiki: Task = {
    id: createId('t'),
    title: 'Restructure internal onboarding wiki',
    description: 'Merge three overlapping onboarding docs into one clear guide.',
    deliverable: 'Single onboarding page, old pages archived',
    size: 'S',
    status: 'blocked',
    assigneeId: jonas.id,
    startDate: addDaysToDateOnly(today(), -10),
    dueDate: addDaysToDateOnly(today(), -1),
    completedAt: null,
    milestones: [],
    comments: [],
    dependsOn: [],
    blockedReason: 'Waiting on access to the old HR wiki space',
    snoozeCount: 1,
    createdAt: now,
    updatedAt: now,
  }

  const teamDashboard: Task = {
    id: createId('t'),
    title: 'Team capacity dashboard v0',
    description: 'A tiny internal page showing who is red/yellow/green this week.',
    deliverable: 'Shareable link, updated manually for now',
    size: 'S',
    status: 'done',
    assigneeId: priya.id,
    startDate: addDaysToDateOnly(today(), -20),
    dueDate: addDaysToDateOnly(today(), -12),
    completedAt: parseDateOnly(addDaysToDateOnly(today(), -12)).toISOString(),
    milestones: [],
    comments: [],
    dependsOn: [],
    blockedReason: null,
    snoozeCount: 0,
    createdAt: now,
    updatedAt: now,
  }

  const costReport: Task = {
    id: createId('t'),
    title: 'Quarterly cloud cost report automation',
    description: 'Script that pulls cost data and emails a summary every quarter.',
    deliverable: 'Script + first automated report sent',
    size: 'M',
    status: 'todo',
    assigneeId: alex.id,
    startDate: addDaysToDateOnly(today(), 5),
    dueDate: addDaysToDateOnly(today(), 21),
    completedAt: null,
    milestones: [],
    comments: [],
    dependsOn: [],
    blockedReason: null,
    snoozeCount: 0,
    createdAt: now,
    updatedAt: now,
  }

  const designSystem: Task = {
    id: createId('t'),
    title: 'Shared component library for side-projects',
    description: 'A tiny design system so side-project UIs stop looking like six different apps.',
    deliverable: 'npm-installable package with 10 base components',
    size: 'XL',
    status: 'in_progress',
    assigneeId: jonas.id,
    startDate: addDaysToDateOnly(today(), -14),
    dueDate: addDaysToDateOnly(today(), 30),
    completedAt: null,
    milestones: [
      { id: createId('m'), title: 'Button, Input, Card done', dueDate: addDaysToDateOnly(today(), 7), done: false },
    ],
    comments: [],
    dependsOn: [],
    blockedReason: null,
    snoozeCount: 2,
    createdAt: now,
    updatedAt: now,
  }

  const tasks = [ocrVendor, ocrRollout, internalWiki, teamDashboard, costReport, designSystem]

  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    users,
    tasks,
    auditLog: [],
    settings: { lastDigestAt: null, lastExportAt: null },
  }
}
