import { redis } from "@/lib/redis";

const KEY_PREFIX = "wolfpack:";

/**
 * Get a cached value with type safety.
 * Returns null if the key does not exist or Redis is unavailable.
 */
export async function cacheGet<T>(key: string): Promise<T | null> {
  try {
    const raw = await redis.get(`${KEY_PREFIX}${key}`);
    if (raw === null) return null;
    return JSON.parse(raw) as T;
  } catch {
    // Cache miss on error — callers fall through to source of truth
    return null;
  }
}

/**
 * Set a cached value with a TTL in seconds.
 */
export async function cacheSet(
  key: string,
  value: unknown,
  ttlSeconds: number,
): Promise<void> {
  try {
    await redis.set(
      `${KEY_PREFIX}${key}`,
      JSON.stringify(value),
      "EX",
      ttlSeconds,
    );
  } catch {
    // Non-fatal — cache write failures should not break the request
  }
}

/**
 * Invalidate all keys matching a glob pattern.
 *
 * Uses SCAN to avoid blocking Redis with KEYS on large datasets.
 * Pattern example: `inventory:dealer:123:*`
 */
export async function cacheInvalidate(pattern: string): Promise<void> {
  const fullPattern = `${KEY_PREFIX}${pattern}`;
  try {
    let cursor = "0";
    do {
      const [nextCursor, keys] = await redis.scan(
        cursor,
        "MATCH",
        fullPattern,
        "COUNT",
        100,
      );
      cursor = nextCursor;
      if (keys.length > 0) {
        await redis.del(...keys);
      }
    } while (cursor !== "0");
  } catch {
    // Non-fatal
  }
}
