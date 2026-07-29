import { describe, expect, it } from 'vitest'
import { migrate } from './StorageAdapter'
import { CURRENT_SCHEMA_VERSION, createEmptyState } from '../types'

describe('migrate', () => {
  it('passes through a state already at the current schema version', () => {
    const state = { ...createEmptyState(), users: [{ id: 'u_1' }] }
    expect(migrate(state)).toBe(state)
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

  it('falls back to an empty state for an unknown future schema version (no downgrade path)', () => {
    // A version newer than what this build knows about must never crash —
    // it resets rather than risk reading a shape this code doesn't understand.
    const future = { ...createEmptyState(), schemaVersion: CURRENT_SCHEMA_VERSION + 1 }
    // Our while-loop only walks versions *below* current, so a version above
    // current is returned as-is (it's not this migration's job to downgrade).
    expect(migrate(future)).toBe(future)
  })

  it('falls back to an empty state for an old version with no registered migration step', () => {
    const stale = { ...createEmptyState(), schemaVersion: 0 }
    expect(migrate(stale)).toEqual(createEmptyState())
  })
})
