/** In-memory TTL cache for tab pages — avoids redundant API bursts on revisit. */

type Entry = { data: unknown; ts: number };

const store = new Map<string, Entry>();

export function readPageCache<T>(key: string, ttlMs: number): T | null {
  const hit = store.get(key);
  if (!hit || Date.now() - hit.ts > ttlMs) return null;
  return hit.data as T;
}

export function writePageCache<T>(key: string, data: T): void {
  store.set(key, { data, ts: Date.now() });
}

export function invalidatePageCache(prefix: string): void {
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) store.delete(key);
  }
}
