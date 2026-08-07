/**
 * Who is using this browser — the actor recorded on every audit entry.
 *
 * Deliberately its own localStorage key rather than a field in AppState:
 * this is a per-device preference, not team data. Putting it in the exported
 * payload would mean importing a colleague's backup silently turns you into
 * them, and every subsequent edit would be attributed to the wrong person.
 * Same reasoning (and same shape) as `sidetrack:theme`.
 */
const STORAGE_KEY = 'sidetrack:currentUser'

/** Mirrors localStorageAdapter's guard — storage can be absent or throw outright in locked-down profiles. */
function getStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

export function loadCurrentUserId(): string | null {
  const storage = getStorage()
  if (!storage) return null
  try {
    return storage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

export function saveCurrentUserId(userId: string | null): void {
  const storage = getStorage()
  if (!storage) return
  try {
    if (userId === null) storage.removeItem(STORAGE_KEY)
    else storage.setItem(STORAGE_KEY, userId)
  } catch {
    // Losing the preference is survivable; a failed write must not break the app.
  }
}

/**
 * A stored id can outlive the user it points at — the teammate was marked
 * inactive and removed, or an import replaced the whole roster. Attributing
 * edits to an id nobody can resolve is worse than attributing them to nobody,
 * because the audit log would render a confident-looking "Someone" either way
 * while the underlying data quietly points nowhere.
 */
export function resolveCurrentUserId(storedId: string | null, users: { id: string }[]): string | null {
  if (storedId === null) return null
  return users.some((u) => u.id === storedId) ? storedId : null
}
