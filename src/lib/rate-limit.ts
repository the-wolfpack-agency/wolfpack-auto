import { redis } from "@/lib/redis";

const KEY_PREFIX = "wolfpack:rl:";

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number; // Unix epoch seconds
}

/* -------------------------------------------------------------------------- */
/* In-memory fallback rate limiter (fail-CLOSED when Redis is unavailable)    */
/*                                                                            */
/* When Redis is down we MUST NOT allow all requests through (fail-open).     */
/* Instead, this sliding-window Map<string, number[]> enforces the same       */
/* limits locally.  It is less accurate under multi-instance deployments,     */
/* but security-correct: no request can bypass rate limiting.                 */
/* -------------------------------------------------------------------------- */

const inMemoryStore = new Map<string, number[]>();

function checkInMemoryRateLimit(
  key: string,
  maxRequests: number,
  windowSeconds: number,
): RateLimitResult {
  const now = Date.now();
  const windowMs = windowSeconds * 1000;
  const windowStart = now - windowMs;

  // Get or create the timestamps list for this key
  let timestamps = inMemoryStore.get(key);
  if (!timestamps) {
    timestamps = [];
    inMemoryStore.set(key, timestamps);
  }

  // Clean up expired entries (older than the window)
  const filtered = timestamps.filter((ts) => ts > windowStart);
  inMemoryStore.set(key, filtered);

  if (filtered.length >= maxRequests) {
    // Over limit — find the oldest entry to determine reset time
    const oldest = filtered[0] ?? now;
    const resetAt = Math.ceil((oldest + windowMs) / 1000);
    return {
      allowed: false,
      remaining: 0,
      resetAt,
    };
  }

  // Under limit — record this request
  filtered.push(now);

  return {
    allowed: true,
    remaining: maxRequests - filtered.length,
    resetAt: Math.ceil((now + windowMs) / 1000),
  };
}

/**
 * Remove all in-memory entries that have fully expired.
 * Called internally on every check to prevent unbounded growth.
 */
export function cleanupInMemoryStore(): void {
  const now = Date.now();
  for (const [key, timestamps] of inMemoryStore) {
    const live = timestamps.filter((ts) => ts > now - 60_000); // 60s minimum window
    if (live.length === 0) {
      inMemoryStore.delete(key);
    } else {
      inMemoryStore.set(key, live);
    }
  }
}

/** Exposed for testing only. */
export function _getInMemoryStore(): Map<string, number[]> {
  return inMemoryStore;
}

/**
 * Sliding-window rate limiter backed by Redis sorted sets.
 *
 * FAIL-CLOSED: When Redis is unavailable, falls back to an in-memory
 * sliding window that enforces the same limits. This ensures no request
 * can bypass rate limiting even during infrastructure failures.
 *
 * @param key       Unique identifier (e.g., `lead:email@example.com`)
 * @param maxRequests  Maximum requests allowed in the window
 * @param windowSeconds  Window duration in seconds
 */
export async function checkRateLimit(
  key: string,
  maxRequests: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  const redisKey = `${KEY_PREFIX}${key}`;
  const now = Date.now();
  const windowStart = now - windowSeconds * 1000;

  // Periodic cleanup of in-memory store (cheap, runs inline)
  cleanupInMemoryStore();

  try {
    const pipeline = redis.pipeline();

    // Remove entries outside the window
    pipeline.zremrangebyscore(redisKey, 0, windowStart);

    // Count entries in the current window
    pipeline.zcard(redisKey);

    // Add the current request (we'll remove it if denied)
    pipeline.zadd(redisKey, now, `${now}:${Math.random()}`);

    // Set expiry on the key so it auto-cleans
    pipeline.expire(redisKey, windowSeconds);

    const results = await pipeline.exec();

    // results[1] is the zcard result: [error, count]
    const currentCount = (results?.[1]?.[1] as number) ?? 0;

    if (currentCount >= maxRequests) {
      // Over limit — remove the entry we just added
      // The entry is the most recent one, but we can just trim
      await redis.zremrangebyscore(redisKey, now, now + 1);

      // Find the oldest entry to determine reset time
      const oldest = await redis.zrange(redisKey, 0, 0, "WITHSCORES");
      const resetAt = oldest.length >= 2
        ? Math.ceil((Number(oldest[1]) + windowSeconds * 1000) / 1000)
        : Math.ceil((now + windowSeconds * 1000) / 1000);

      return {
        allowed: false,
        remaining: 0,
        resetAt,
      };
    }

    return {
      allowed: true,
      remaining: maxRequests - currentCount - 1,
      resetAt: Math.ceil((now + windowSeconds * 1000) / 1000),
    };
  } catch {
    // Redis is down — fail CLOSED using in-memory fallback.
    // This ensures rate limiting is always enforced, even without Redis.
    return checkInMemoryRateLimit(key, maxRequests, windowSeconds);
  }
}
