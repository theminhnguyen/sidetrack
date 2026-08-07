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
})
