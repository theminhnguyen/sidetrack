/**
 * Runs before test modules are imported, so the store's module-level
 * `localStorageAdapter.load()` sees a working storage instead of the
 * no-storage fallback path.
 */
const store = new Map<string, string>()

const memoryStorage: Storage = {
  get length() {
    return store.size
  },
  clear: () => store.clear(),
  getItem: (key) => store.get(key) ?? null,
  key: (index) => [...store.keys()][index] ?? null,
  removeItem: (key) => void store.delete(key),
  setItem: (key, value) => void store.set(key, value),
}

globalThis.localStorage = memoryStorage

export function resetTestStorage() {
  store.clear()
}

export function readTestStorage(key: string) {
  return store.get(key) ?? null
}
