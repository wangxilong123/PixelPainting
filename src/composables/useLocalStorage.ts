const cachedValues = new Map<string, string>()
const pendingWrites = new Set<string>()

export function useLocalStorage(key: string) {
  return {
    read(): string | null {
      if (!pendingWrites.has(key)) {
        try {
          const value = globalThis.localStorage.getItem(key)
          if (value === null) cachedValues.delete(key)
          else cachedValues.set(key, value)
          return value
        } catch {
          // The in-memory value is still available within this page.
        }
      }
      return cachedValues.get(key) ?? null
    },
    write(value: string): void {
      cachedValues.set(key, value)
      try {
        globalThis.localStorage.setItem(key, value)
        pendingWrites.delete(key)
      } catch {
        // Keep a failed write ahead of any stale value on disk.
        pendingWrites.add(key)
      }
    },
  }
}
