import { beforeEach, describe, expect, it } from 'vitest'
import { loadCurrentUserId, resolveCurrentUserId, saveCurrentUserId } from './currentUser'
import { resetTestStorage } from '../test/setup'

beforeEach(() => {
  resetTestStorage()
})

describe('currentUser storage round-trip', () => {
  it('survives being written and read back — the whole point, since a lost id means audit entries say "Someone"', () => {
    saveCurrentUserId('u_alex')
    expect(loadCurrentUserId()).toBe('u_alex')
  })

  it('returns null when nothing has ever been stored', () => {
    expect(loadCurrentUserId()).toBeNull()
  })

  it('clears the key entirely when set back to nobody, rather than storing "null" as a string', () => {
    saveCurrentUserId('u_alex')
    saveCurrentUserId(null)
    expect(loadCurrentUserId()).toBeNull()
  })
})

describe('resolveCurrentUserId', () => {
  const users = [{ id: 'u_alex' }, { id: 'u_priya' }]

  it('keeps an id that still matches someone on the roster', () => {
    expect(resolveCurrentUserId('u_alex', users)).toBe('u_alex')
  })

  it('drops an id whose user no longer exists (removed teammate, or an import swapped the roster)', () => {
    expect(resolveCurrentUserId('u_ghost', users)).toBeNull()
  })

  it('drops any stored id when the roster is empty', () => {
    expect(resolveCurrentUserId('u_alex', [])).toBeNull()
  })

  it('passes null through untouched', () => {
    expect(resolveCurrentUserId(null, users)).toBeNull()
  })
})
