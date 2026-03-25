import { redis } from "@/lib/redis";

const KEY_PREFIX = "wolfpack:rl:";

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number; // Unix epoch seconds
}

/**
 * Sliding-window rate limiter backed by Redis sorted sets.
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
    // If Redis is down, fail open — allow the request
    return {
      allowed: true,
      remaining: maxRequests,
      resetAt: Math.ceil((now + windowSeconds * 1000) / 1000),
    };
  }
}
