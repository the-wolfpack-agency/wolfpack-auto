/* eslint-disable @typescript-eslint/no-explicit-any */
export {}; // module marker: keeps top-level test consts out of global scope
/**
 * Contract tests for GET /api/health.
 *
 * The behaviour under test, and why it exists:
 *
 * Redis is OPTIONAL in this app — rate-limit.ts falls back to an in-memory
 * sliding window and still fails CLOSED, so an absent Redis degrades accuracy
 * across instances but never disables rate limiting. Production has no
 * REDIS_URL at all, and the old client defaulted an unset value to
 * redis://localhost:6379. There is no localhost Redis on a serverless deploy,
 * so every probe burned 3 retries and /api/health reported a permanent
 * "degraded" with a maxRetriesPerRequest error. Permanent degraded is noise
 * that hides a real outage when one arrives.
 *
 * So: an unconfigured Redis is a deliberate configuration, not an outage.
 * Postgres is the only hard dependency — it is the source of truth.
 */

const mockPing = jest.fn();
const mockQuery = jest.fn();
const mockIsRedisConfigured = jest.fn();
const mockTrackSystem = jest.fn();

jest.mock("@/lib/db", () => ({ pool: { query: (...a: any[]) => mockQuery(...a) } }));
jest.mock("@/lib/redis", () => ({
  redis: { ping: (...a: any[]) => mockPing(...a) },
  isRedisConfigured: () => mockIsRedisConfigured(),
}));
jest.mock("@/lib/analytics-hooks", () => ({
  trackSystem: (...a: any[]) => mockTrackSystem(...a),
}));

async function callHealth() {
  const { GET } = await import("@/app/api/health/route");
  const res = await GET();
  return { res, body: (await res.json()) as any };
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.resetModules();
  mockQuery.mockResolvedValue({ rows: [{ "?column?": 1 }] });
  mockPing.mockResolvedValue("PONG");
  mockIsRedisConfigured.mockReturnValue(true);
});

describe("GET /api/health — Redis is optional", () => {
  it("reports healthy 200 when Redis is not configured, and never pings it", async () => {
    mockIsRedisConfigured.mockReturnValue(false);
    const { res, body } = await callHealth();

    // The regression this pins: prod was permanently "degraded" for this case.
    expect(res.status).toBe(200);
    expect(body.status).toBe("healthy");
    expect(body.checks.redis.configured).toBe(false);
    expect(body.checks.redis.error).toBe("not_configured");
    // Pinging a never-connecting client only yields a misleading error.
    expect(mockPing).not.toHaveBeenCalled();
  });

  it("reports healthy when Redis is configured and up", async () => {
    const { res, body } = await callHealth();
    expect(res.status).toBe(200);
    expect(body.status).toBe("healthy");
    expect(body.checks.redis.ok).toBe(true);
    expect(body.checks.redis.configured).toBe(true);
    expect(mockPing).toHaveBeenCalledTimes(1);
  });

  it("reports degraded (still 200) when Redis IS configured but down", async () => {
    mockPing.mockRejectedValue(new Error("Reached the max retries per request limit"));
    const { res, body } = await callHealth();

    // A configured-but-down Redis is a real signal and must NOT be swallowed.
    expect(res.status).toBe(200);
    expect(body.status).toBe("degraded");
    expect(body.checks.redis.ok).toBe(false);
    expect(body.checks.redis.configured).toBe(true);
    expect(body.checks.redis.error).toContain("max retries");
  });
});

describe("GET /api/health — Postgres is the hard dependency", () => {
  it("reports unhealthy 503 when Postgres is down", async () => {
    mockQuery.mockRejectedValue(new Error("connection refused"));
    mockIsRedisConfigured.mockReturnValue(false);
    const { res, body } = await callHealth();

    expect(res.status).toBe(503);
    expect(body.status).toBe("unhealthy");
    expect(body.checks.postgres.ok).toBe(false);
  });

  it("still 503 on Postgres down even when Redis is healthy", async () => {
    mockQuery.mockRejectedValue(new Error("connection refused"));
    const { res, body } = await callHealth();
    expect(res.status).toBe(503);
    expect(body.status).toBe("unhealthy");
  });
});

describe("GET /api/health — feeds the learning mechanism", () => {
  it("emits system.health_check when healthy, with the probe data", async () => {
    mockIsRedisConfigured.mockReturnValue(false);
    await callHealth();

    expect(mockTrackSystem).toHaveBeenCalledTimes(1);
    const [event, , meta] = mockTrackSystem.mock.calls[0];
    expect(event).toBe("system.health_check");
    // No data lost: the probe is a row, so degradation is measurable over time.
    expect(meta.postgres_ok).toBe(true);
    expect(meta.redis_configured).toBe(false);
    expect(typeof meta.postgres_latency_ms).toBe("number");
  });

  it("emits system.health_degraded when a configured Redis is down", async () => {
    mockPing.mockRejectedValue(new Error("down"));
    await callHealth();
    expect(mockTrackSystem.mock.calls[0][0]).toBe("system.health_degraded");
  });

  it("emits system.health_critical when Postgres is down", async () => {
    mockQuery.mockRejectedValue(new Error("down"));
    await callHealth();
    expect(mockTrackSystem.mock.calls[0][0]).toBe("system.health_critical");
  });
});
