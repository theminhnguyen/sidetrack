import { describe, expect, it } from 'vitest'
import { migrate } from './StorageAdapter'
import { CURRENT_SCHEMA_VERSION, createEmptyState } from '../types'

describe('migrate', () => {
  it('passes through a state already at the current schema version', () => {
    const state = { ...createEmptyState(), users: [{ id: 'u_1' }] }
    // Reference equality is not expected: migrate() always normalizes
    // (see the "fills in a missing settings field" test below for why).
    expect(migrate(state)).toEqual(state)
  })

  it('falls back to an empty state for null/undefined input', () => {
    expect(migrate(null)).toEqual(createEmptyState())
    expect(migrate(undefined)).toEqual(createEmptyState())
  })

  it('falls back to an empty state for non-object input', () => {
    expect(migrate('not an object')).toEqual(createEmptyState())
    expect(migrate(42)).toEqual(createEmptyState())
  })

  it('falls back to an empty state when schemaVersion is missing or not a number', () => {
    expect(migrate({ users: [] })).toEqual(createEmptyState())
    expect(migrate({ schemaVersion: '1' })).toEqual(createEmptyState())
  })

  it('falls back to an empty state for an unknown future schema version (PLAN-V2 P0.4)', () => {
    // Regression: this used to be returned unchanged ("it's not this
    // migration's job to downgrade"). But a version newer than this build
    // knows about could have renamed or repurposed any field — reading it
    // with today's assumptions risks silent corruption, not just a crash.
    const future = { ...createEmptyState(), schemaVersion: CURRENT_SCHEMA_VERSION + 1 }
    expect(migrate(future)).toEqual(createEmptyState())
  })

  it('falls back to an empty state for an old version with no registered migration step', () => {
    const stale = { ...createEmptyState(), schemaVersion: 0 }
    expect(migrate(stale)).toEqual(createEmptyState())
  })

  it('fills in a missing settings field rather than passing it through (PLAN-V2 P0.4)', () => {
    // A hand-edited or truncated export missing `settings` used to be
    // accepted as-is, and then crashed the first time the digest read
    // `state.settings.lastDigestAt`.
    const noSettings = { schemaVersion: CURRENT_SCHEMA_VERSION, users: [], tasks: [], auditLog: [] }
    expect(migrate(noSettings)).toEqual(createEmptyState())
  })

  it('fills in missing users/tasks/auditLog individually, without discarding the rest', () => {
    const partial = { schemaVersion: CURRENT_SCHEMA_VERSION, tasks: [{ id: 't_1' }] }
    const result = migrate(partial)
    expect(result.users).toEqual([])
    expect(result.tasks).toEqual([{ id: 't_1' }])
    expect(result.auditLog).toEqual([])
    expect(result.settings).toEqual(createEmptyState().settings)
  })

  it('migrates v1 all the way to the current schema: drops the unused miro scaffolding, adds lastExportAt, keeps lastDigestAt (PLAN-V2 P1/P4.3)', () => {
    const v1 = {
      schemaVersion: 1,
      users: [{ id: 'u_1' }],
      tasks: [{ id: 't_1' }],
      auditLog: [],
      settings: { lastDigestAt: '2026-08-01T00:00:00.000Z', miro: { enabled: true, boardId: 'board_123' } },
    }

    const result = migrate(v1)

    // migrate() always chains every step up to CURRENT_SCHEMA_VERSION, not
    // just the next one — pinning this to a literal would silently stop
    // testing the chain the moment a new step is added.
    expect(result.schemaVersion).toBe(CURRENT_SCHEMA_VERSION)
    expect(result.settings).toEqual({ lastDigestAt: '2026-08-01T00:00:00.000Z', lastExportAt: null })
    expect('miro' in result.settings).toBe(false)
    expect(result.users).toEqual(v1.users)
    // Picked up along the way by the v2 -> v3 step below.
    expect(result.tasks).toEqual([{ id: 't_1', comments: [] }])
  })

  it('migrates v2 to v3: backfills an empty comments list onto every existing task', () => {
    const v2 = {
      schemaVersion: 2,
      users: [],
      tasks: [{ id: 't_1' }, { id: 't_2', comments: [{ id: 'c_1' }] }],
      auditLog: [],
      settings: { lastDigestAt: null, lastExportAt: null },
    }

    const result = migrate(v2)

    expect(result.schemaVersion).toBe(CURRENT_SCHEMA_VERSION)
    // A task missing the field entirely gets a fresh empty array...
    expect(result.tasks[0]).toEqual({ id: 't_1', comments: [] })
    // ...but a task that already has comments (e.g. a file already on v3
    // read by mistake through this step) is left untouched.
    expect(result.tasks[1]).toEqual({ id: 't_2', comments: [{ id: 'c_1' }] })
  })
})
