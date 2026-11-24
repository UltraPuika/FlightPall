/**
 * Small TTL cache for provider responses. Memory first, optionally backed by
 * localStorage (best effort — storage may be unavailable or full).
 */
export interface CacheStore<T> {
  get(key: string): T | undefined;
  set(key: string, value: T, ttlMs: number): void;
  clear(): void;
}

interface Entry<T> {
  v: T;
  exp: number;
}

export function createTtlCache<T>(opts: { storage?: Storage | null; prefix?: string; now?: () => number; maxEntries?: number } = {}): CacheStore<T> {
  const mem = new Map<string, Entry<T>>();
  const prefix = opts.prefix ?? 'fp-cache:';
  const now = opts.now ?? Date.now;
  const storage = opts.storage ?? null;
  const max = opts.maxEntries ?? 300;

  return {
    get(key) {
      const hit = mem.get(key);
      if (hit) {
        if (hit.exp > now()) return hit.v;
        mem.delete(key);
      }
      if (!storage) return undefined;
      try {
        const raw = storage.getItem(prefix + key);
        if (!raw) return undefined;
        const parsed = JSON.parse(raw) as Entry<T>;
        if (parsed.exp <= now()) {
          storage.removeItem(prefix + key);
          return undefined;
        }
        mem.set(key, parsed);
        return parsed.v;
      } catch {
        return undefined;
      }
    },
    set(key, value, ttlMs) {
      if (ttlMs <= 0) return;
      const entry = { v: value, exp: now() + ttlMs };
      mem.set(key, entry);
      if (mem.size > max) mem.delete(mem.keys().next().value as string);
      if (!storage) return;
      try {
        storage.setItem(prefix + key, JSON.stringify(entry));
      } catch {
        // Quota exceeded: drop persisted cache entries and continue in memory only
        try {
          for (let i = storage.length - 1; i >= 0; i--) {
            const k = storage.key(i);
            if (k?.startsWith(prefix)) storage.removeItem(k);
          }
        } catch {
          /* ignore */
        }
      }
    },
    clear() {
      mem.clear();
      if (!storage) return;
      try {
        for (let i = storage.length - 1; i >= 0; i--) {
          const k = storage.key(i);
          if (k?.startsWith(prefix)) storage.removeItem(k);
        }
      } catch {
        /* ignore */
      }
    },
  };
}
