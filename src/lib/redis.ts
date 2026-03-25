import Redis from "ioredis";

/**
 * Singleton Redis client.
 *
 * Attached to `globalThis` during development to survive HMR without
 * opening new connections on every reload.
 */
function createRedisClient(): Redis {
  const globalForRedis = globalThis as unknown as { __redis?: Redis };

  if (!globalForRedis.__redis) {
    const url = process.env.REDIS_URL ?? "redis://localhost:6379";

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
