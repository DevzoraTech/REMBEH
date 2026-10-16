import { Logger } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { incrementRedisRateLimit } from '../cache/redis-rate-limit.store';

type WindowCounter = {
  count: number;
  resetAt: number;
};

const logger = new Logger('ApiPerformance');
const counters = new Map<string, WindowCounter>();
let lastCleanupAt = 0;

const WINDOW_MS = 60_000;
const DEFAULT_SLOW_MS = 1_000;
const DEFAULT_PRODUCTION_SLOW_LOG_SAMPLE_RATE = 0.1;

export async function apiPerformanceMiddleware(
  request: Request,
  response: Response,
  next: NextFunction,
) {
  const now = Date.now();
  cleanExpiredCounters(now);

  const limit = rateLimitFor(request);
  if (limit != null) {
    const identity = `${request.ip}:${request.headers.authorization?.slice(-24) ?? 'anonymous'}:${request.path}`;
    const counter =
      (await incrementRedisRateLimit(request.path, identity, WINDOW_MS)) ??
      incrementLocalRateLimit(identity, now);

    response.setHeader('X-RateLimit-Limit', String(limit));
    response.setHeader(
      'X-RateLimit-Remaining',
      String(Math.max(0, limit - counter.count)),
    );

    if (counter.count > limit) {
      response.setHeader(
        'Retry-After',
        String(Math.max(1, Math.ceil((counter.resetAt - now) / 1000))),
      );
      response.status(429).json({
        statusCode: 429,
        message: 'Too many requests. Please wait briefly and try again.',
      });
      return;
    }
  }

  const startedAt = process.hrtime.bigint();
  response.once('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    const slowThreshold = positiveNumber(
      process.env.API_SLOW_REQUEST_MS,
      DEFAULT_SLOW_MS,
    );
    const contentLength = Number(response.getHeader('content-length') ?? 0);

    const shouldLogPerformance =
      durationMs >= slowThreshold || contentLength >= 1_000_000;
    const isServerError = response.statusCode >= 500;
    if (shouldLogPerformance && (isServerError || shouldSampleSlowLog())) {
      logger.warn(
        `${request.method} ${request.originalUrl} status=${response.statusCode} durationMs=${durationMs.toFixed(1)} bytes=${contentLength || 'streamed'}`,
      );
    }
  });

  next();
}

function shouldSampleSlowLog() {
  const fallback =
    process.env.NODE_ENV === 'production'
      ? DEFAULT_PRODUCTION_SLOW_LOG_SAMPLE_RATE
      : 1;
  const rate = Number(process.env.API_PERFORMANCE_LOG_SAMPLE_RATE ?? fallback);
  if (!Number.isFinite(rate) || rate <= 0) return false;
  if (rate >= 1) return true;
  return Math.random() < rate;
}

function incrementLocalRateLimit(key: string, now: number): WindowCounter {
  const current = counters.get(key);
  const counter =
    current && current.resetAt > now
      ? current
      : { count: 0, resetAt: now + WINDOW_MS };
  counter.count += 1;
  counters.set(key, counter);
  return counter;
}

function rateLimitFor(request: Request): number | null {
  if (request.method !== 'GET') return null;

  if (request.path.endsWith('/sync/snapshot')) {
    return positiveNumber(process.env.SYNC_RATE_LIMIT_PER_MINUTE, 12);
  }

  if (/\/(export|pdf)(\/|$)/i.test(request.path)) {
    return positiveNumber(process.env.EXPORT_RATE_LIMIT_PER_MINUTE, 20);
  }

  return null;
}

function cleanExpiredCounters(now: number) {
  if (now - lastCleanupAt < WINDOW_MS) return;
  lastCleanupAt = now;
  for (const [key, counter] of counters) {
    if (counter.resetAt <= now) counters.delete(key);
  }
}

function positiveNumber(raw: string | undefined, fallback: number) {
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}
