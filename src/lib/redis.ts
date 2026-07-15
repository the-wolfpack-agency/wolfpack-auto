import Redis from "ioredis";

/**
 * Singleton Redis client.
 *
 * Attached to `globalThis` during development to survive HMR without
 * opening new connections on every reload.
 *
 * When REDIS_URL is set to empty string, returns a stub that no-ops
 * all operations (shadow/CI mode).
 */

/**
 * True when a real Redis endpoint is configured for this environment.
 *
 * Redis is OPTIONAL here: rate-limit.ts falls back to an in-memory sliding
 * window and still fails CLOSED, so an unconfigured Redis degrades accuracy
 * across instances — it does not disable rate limiting.
 *
 * Unset in production is treated as "not configured", NOT as localhost. There
 * is no localhost Redis on a serverless deploy, so the old default made every
 * call burn 3 retries against an address that can never answer and made
 * /api/health report a misleading permanent "degraded".
 */
export function isRedisConfigured(): boolean {
  const url = process.env.REDIS_URL;
  if (url === "") return false; // explicitly disabled (shadow/CI)
  if (url) return true;
  // Unset: only meaningful outside production, where a local Redis may exist.
  return process.env.NODE_ENV !== "production";
}

function createRedisClient(): Redis {
  const globalForRedis = globalThis as unknown as { __redis?: Redis };

  if (!globalForRedis.__redis) {
    const url = process.env.REDIS_URL || "redis://localhost:6379";

    // Explicitly empty (shadow/CI) OR unset in production: a client that never
    // connects, rather than one that retries localhost forever.
    if (!isRedisConfigured()) {
      globalForRedis.__redis = new Redis({
        lazyConnect: true,
        enableOfflineQueue: false,
        maxRetriesPerRequest: 0,
        retryStrategy: () => null,
      });
      // Swallow all errors silently — this client is intentionally disconnected
      globalForRedis.__redis.on("error", () => {});
      return globalForRedis.__redis;
    }

    globalForRedis.__redis = new Redis(url, {
      maxRetriesPerRequest: 3,
      retryStrategy(times) {
        if (times > 10) return null; // stop retrying
        return Math.min(times * 200, 2_000);
      },
      lazyConnect: true,
    });

    globalForRedis.__redis.on("error", (err) => {
      console.error("[redis] Connection error:", err.message);
    });
  }

  return globalForRedis.__redis;
}

export const redis = createRedisClient();
