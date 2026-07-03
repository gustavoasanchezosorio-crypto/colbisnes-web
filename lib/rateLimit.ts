/**
 * Simple in-memory rate limiter using sliding window.
 * Works per serverless instance — good enough for basic abuse prevention.
 * For distributed rate limiting across instances, use Upstash Redis.
 */

interface RateLimitRecord {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateLimitRecord>();

// Cleanup old entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, record] of store.entries()) {
    if (record.resetAt < now) store.delete(key);
  }
}, 5 * 60 * 1000);

export interface RateLimitOptions {
  /** Max requests allowed in the window */
  limit: number;
  /** Window duration in seconds */
  windowSeconds: number;
}

export function rateLimit(
  identifier: string,
  options: RateLimitOptions
): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
  const windowMs = options.windowSeconds * 1000;
  const key = `rl:${identifier}`;

  const record = store.get(key);

  if (!record || record.resetAt < now) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: options.limit - 1, resetAt: now + windowMs };
  }

  record.count += 1;

  if (record.count > options.limit) {
    return { allowed: false, remaining: 0, resetAt: record.resetAt };
  }

  return { allowed: true, remaining: options.limit - record.count, resetAt: record.resetAt };
}

/** Extract the real IP from Next.js request headers */
export function getIP(request: Request): string {
  const forwarded = (request.headers as any).get?.("x-forwarded-for") ||
    (request.headers as Headers).get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return "unknown";
}
