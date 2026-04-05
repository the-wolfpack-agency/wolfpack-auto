/**
 * Rate Limit Failsafe Tests
 *
 * Verifies that the rate limiter fails CLOSED (blocks requests)
 * when Redis is unavailable, using an in-memory sliding window fallback.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import {
  checkRateLimit,
  cleanupInMemoryStore,
  _getInMemoryStore,
} from "@/lib/rate-limit";

// ---------------------------------------------------------------------------
// Mock Redis — we control whether it works or throws
// ---------------------------------------------------------------------------

let redisAvailable = true;

const mockPipeline = {
  zremrangebyscore: jest.fn().mockReturnThis(),
  zcard: jest.fn().mockReturnThis(),
  zadd: jest.fn().mockReturnThis(),
  expire: jest.fn().mockReturnThis(),
  exec: jest.fn(async () => {
    if (!redisAvailable) throw new Error("Redis connection refused");
    // Return: [zremrangebyscore result, zcard result, zadd result, expire result]
    return [
      [null, 0],  // zremrangebyscore
      [null, 0],  // zcard — 0 entries in window (will be incremented by caller logic)
      [null, 1],  // zadd
      [null, 1],  // expire
    ];
  }),
};

jest.mock("@/lib/redis", () => ({
  redis: {
    pipeline: () => mockPipeline,
    zremrangebyscore: jest.fn(),
    zrange: jest.fn(async () => []),
  },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clearInMemory() {
  const store = _getInMemoryStore();
  store.clear();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("rate-limit failsafe", () => {
  beforeEach(() => {
    redisAvailable = true;
    clearInMemory();
    jest.clearAllMocks();
  });

  // 1. When Redis is available, rate limiting works normally
  it("allows requests when Redis is available and under limit", async () => {
    const result = await checkRateLimit("test:user1", 5, 60);

    expect(result.allowed).toBe(true);
    expect(result.remaining).toBeGreaterThanOrEqual(0);
    expect(result.resetAt).toBeGreaterThan(0);
    expect(mockPipeline.exec).toHaveBeenCalled();
  });

  // 2. When Redis is down, in-memory fallback enforces limits (NOT fails open)
  it("uses in-memory fallback when Redis is down (does NOT fail open)", async () => {
    redisAvailable = false;

    // First request should be allowed (in-memory, under limit)
    const result1 = await checkRateLimit("test:user2", 3, 60);
    expect(result1.allowed).toBe(true);
    expect(result1.remaining).toBe(2);

    // Second request
    const result2 = await checkRateLimit("test:user2", 3, 60);
    expect(result2.allowed).toBe(true);
    expect(result2.remaining).toBe(1);

    // Third request
    const result3 = await checkRateLimit("test:user2", 3, 60);
    expect(result3.allowed).toBe(true);
    expect(result3.remaining).toBe(0);

    // Fourth request should be BLOCKED (not allowed through)
    const result4 = await checkRateLimit("test:user2", 3, 60);
    expect(result4.allowed).toBe(false);
    expect(result4.remaining).toBe(0);
  });

  // 3. In-memory limiter correctly blocks after max requests
  it("blocks after exactly maxRequests in-memory", async () => {
    redisAvailable = false;
    const maxRequests = 2;
    const window = 60;

    // Allow 2
    for (let i = 0; i < maxRequests; i++) {
      const r = await checkRateLimit("test:exact", maxRequests, window);
      expect(r.allowed).toBe(true);
    }

    // Block the 3rd
    const blocked = await checkRateLimit("test:exact", maxRequests, window);
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.resetAt).toBeGreaterThan(0);
  });

  // 4. In-memory limiter correctly allows after window expires
  it("resets after the window expires", async () => {
    redisAvailable = false;
    const maxRequests = 1;
    const windowSeconds = 1; // 1-second window

    // Use up the quota
    const r1 = await checkRateLimit("test:expire", maxRequests, windowSeconds);
    expect(r1.allowed).toBe(true);

    // Immediately blocked
    const r2 = await checkRateLimit("test:expire", maxRequests, windowSeconds);
    expect(r2.allowed).toBe(false);

    // Manually expire the timestamps by backdating them
    const store = _getInMemoryStore();
    const timestamps = store.get("test:expire");
    if (timestamps) {
      // Set all timestamps to 2 seconds ago (outside the 1s window)
      for (let i = 0; i < timestamps.length; i++) {
        timestamps[i] = Date.now() - 2000;
      }
    }

    // Now should be allowed again (old entries are outside window)
    const r3 = await checkRateLimit("test:expire", maxRequests, windowSeconds);
    expect(r3.allowed).toBe(true);
  });

  // 5. Cleanup removes expired entries
  it("cleanupInMemoryStore removes fully expired keys", () => {
    const store = _getInMemoryStore();

    // Add an entry that's already expired (2 minutes old)
    store.set("test:old", [Date.now() - 120_000]);

    // Add an entry that's recent
    store.set("test:recent", [Date.now()]);

    cleanupInMemoryStore();

    // Old entry should be removed
    expect(store.has("test:old")).toBe(false);

    // Recent entry should remain
    expect(store.has("test:recent")).toBe(true);
  });

  // Additional: different keys are tracked independently
  it("tracks different keys independently in fallback", async () => {
    redisAvailable = false;

    // Fill up key A
    await checkRateLimit("test:keyA", 1, 60);
    const blockedA = await checkRateLimit("test:keyA", 1, 60);
    expect(blockedA.allowed).toBe(false);

    // Key B should still be allowed
    const allowedB = await checkRateLimit("test:keyB", 1, 60);
    expect(allowedB.allowed).toBe(true);
  });
});
