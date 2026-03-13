/**
 * Simple in-memory cache for API responses.
 * Survives page navigation (components unmount/remount)
 * but clears on full page refresh.
 */
const store = new Map<string, { data: unknown; timestamp: number }>()

const TTL = 30_000 // 30 seconds

export function getCached<T>(key: string): T | null {
  const entry = store.get(key)
  if (!entry) return null
  if (Date.now() - entry.timestamp > TTL) {
    store.delete(key)
    return null
  }
  return entry.data as T
}

export function setCache(key: string, data: unknown) {
  store.set(key, { data, timestamp: Date.now() })
}

export function clearCache(key?: string) {
  if (key) store.delete(key)
  else store.clear()
}
