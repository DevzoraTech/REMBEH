import { createHash } from 'node:crypto';
import Redis from 'ioredis';

type RateLimitCounter = {
  count: number;
  resetAt: number;
};

let client: Redis | null = null;
let connecting: Promise<Redis | null> | null = null;
let unavailableUntil = 0;

/**
 * Optional Redis-backed counters for expensive read endpoints. Redis is never
 * used for financial data, so a connection failure simply falls back to the
 * in-process limiter without affecting an operation or its reported figures.
 */
export async function incrementRedisRateLimit(
  scope: string,
  identity: string,
  windowMs: number,
): Promise<RateLimitCounter | null> {
  const redis = await getRedisClient();
  if (!redis) return null;

  const hash = createHash('sha256').update(identity).digest('hex');
  const key = `rembeh:rate-limit:v1:${scope}:${hash}`;

  try {
    const count = await redis.incr(key);
    if (count === 1) {
      await redis.pexpire(key, windowMs);
    }
    const remainingMs = await redis.pttl(key);
    return {
      count,
      resetAt: Date.now() + Math.max(remainingMs, 1),
    };
  } catch (_) {
    markUnavailable();
    return null;
  }
}

async function getRedisClient(): Promise<Redis | null> {
  const url = process.env.REDIS_URL?.trim();
  if (!url || Date.now() < unavailableUntil) return null;
  if (client?.status === 'ready') return client;
  if (connecting != null) return connecting;

  connecting = connect(url).finally(() => {
    connecting = null;
  });
  return connecting;
}

async function connect(url: string): Promise<Redis | null> {
  const next = new Redis(url, {
    lazyConnect: true,
    connectTimeout: 500,
    enableOfflineQueue: false,
    maxRetriesPerRequest: 0,
    retryStrategy: () => null,
  });
  // Errors are handled by the caller; without this listener ioredis emits an
  // unhandled error event when a configured Redis endpoint is unavailable.
  next.on('error', () => undefined);

  try {
    await next.connect();
    client = next;
    return client;
  } catch (_) {
    next.disconnect();
    markUnavailable();
    return null;
  }
}

function markUnavailable() {
  client?.disconnect();
  client = null;
  unavailableUntil = Date.now() + 30_000;
}
