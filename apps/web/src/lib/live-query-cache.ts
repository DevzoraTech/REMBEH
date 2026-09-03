/**
 * Short-lived in-memory cache for owner/manager web fetches.
 * Never written to disk. Fresh for 20s, discarded after 90s.
 */

export const LIVE_QUERY_REVALIDATE_EVENT = "rembeh-live-query-revalidate";

const FRESH_MS = 20_000;
const STALE_MS = 90_000;

type CacheEntry = {
  data: unknown;
  at: number;
};

const store = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<unknown>>();

function ageOf(entry: CacheEntry) {
  return Date.now() - entry.at;
}

function notifyRevalidate() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(LIVE_QUERY_REVALIDATE_EVENT));
}

export function peekLiveQuery<T>(key: string): T | undefined {
  const entry = store.get(key);
  if (!entry) return undefined;
  if (ageOf(entry) > STALE_MS) {
    store.delete(key);
    return undefined;
  }
  return entry.data as T;
}

export function writeLiveQuery<T>(key: string, data: T) {
  store.set(key, { data, at: Date.now() });
}

export function clearLiveQueryCache(options?: { notify?: boolean }) {
  store.clear();
  inflight.clear();
  if (options?.notify) {
    notifyRevalidate();
  }
}

export function invalidateLiveQueries(match?: string, options?: { notify?: boolean }) {
  if (!match) {
    store.clear();
  } else {
    for (const key of [...store.keys()]) {
      if (key.includes(match)) {
        store.delete(key);
      }
    }
  }
  if (options?.notify !== false) {
    notifyRevalidate();
  }
}

export async function liveQuery<T>(
  key: string,
  loader: () => Promise<T>,
  options?: { fresh?: boolean },
): Promise<T> {
  const cached = store.get(key);
  if (
    !options?.fresh &&
    cached &&
    ageOf(cached) < FRESH_MS
  ) {
    return cached.data as T;
  }

  const existing = inflight.get(key);
  if (existing) {
    return existing as Promise<T>;
  }

  const request = (async () => {
    try {
      const data = await loader();
      store.set(key, { data, at: Date.now() });
      return data;
    } catch (error) {
      if (cached && ageOf(cached) < STALE_MS) {
        return cached.data as T;
      }
      throw error;
    } finally {
      inflight.delete(key);
    }
  })();

  inflight.set(key, request);
  return request;
}
