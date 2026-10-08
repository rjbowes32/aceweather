type Entry = { expires: number; value: Promise<unknown> };

const MAX_ENTRIES = 500;
const store = new Map<string, Entry>();

/** Per-instance TTL cache that also de-duplicates concurrent loads. Failures are never cached. */
export function cached<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const hit = store.get(key);
  if (hit && hit.expires > now) return hit.value as Promise<T>;
  const value = load();
  store.delete(key);
  store.set(key, { expires: now + ttlMs, value });
  value.catch(() => {
    if (store.get(key)?.value === value) store.delete(key);
  });
  if (store.size > MAX_ENTRIES) store.delete(store.keys().next().value as string);
  return value;
}

export function seed<T>(key: string, ttlMs: number, value: Promise<T>): void {
  if (!store.has(key)) store.set(key, { expires: Date.now() + ttlMs, value });
}

export function clearCache(): void {
  store.clear();
}
