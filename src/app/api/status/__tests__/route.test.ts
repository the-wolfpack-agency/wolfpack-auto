/**
 * Contract tests for GET /api/status.
 *
 * Requirements:
 *   - Always returns HTTP 200, even when DB throws.
 *   - Returns 200 with status info when everything is fine.
 *   - Caches the payload for 60s in-process.
 *   - The components array contains the expected names in a stable order.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

// Mock pg pool — every test customizes the SELECT 1 behavior.
const mockQuery = jest.fn();
jest.mock("@/lib/db", () => ({
  pool: {
    query: (...args: any[]) => mockQuery(...args),
  },
}));

import { GET } from "@/app/api/status/route";
import {
  STATUS_COMPONENT_NAMES,
  __resetStatusCacheForTests,
  type StatusPayload,
} from "@/lib/status/types";

const ORIGINAL_ENV = { ...process.env };
const ORIGINAL_FETCH = global.fetch;

function resetEnv() {
  process.env = { ...ORIGINAL_ENV };
}

beforeEach(() => {
  mockQuery.mockReset();
  resetEnv();
  __resetStatusCacheForTests();
  // Default: stub global fetch so probe of Qdrant/Neo4j doesn't hit network.
  global.fetch = jest.fn(async () => ({
    ok: true,
    status: 200,
  })) as unknown as typeof fetch;
});

afterAll(() => {
  global.fetch = ORIGINAL_FETCH;
  process.env = ORIGINAL_ENV;
});

describe("GET /api/status", () => {
  it("returns 200 with a full status payload when probes succeed", async () => {
    process.env.DATABASE_URL = "postgres://test";
    process.env.QDRANT_URL = "http://qdrant:6333";
    process.env.NEO4J_URL = "http://neo4j:7474";
    process.env.FAL_API_KEY = "fal-key";
    process.env.RESEND_API_KEY = "resend-key";
    mockQuery.mockResolvedValue({ rows: [{ "?column?": 1 }] });

    const res = await GET();
    expect(res.status).toBe(200);

    const body = (await res.json()) as StatusPayload;
    expect(body.overall).toBe("operational");
    expect(Array.isArray(body.components)).toBe(true);
    expect(body.components).toHaveLength(STATUS_COMPONENT_NAMES.length);
    for (const expected of STATUS_COMPONENT_NAMES) {
      const found = body.components.find((c) => c.name === expected);
      expect(found).toBeTruthy();
      expect(found?.status).toBe("operational");
      expect(typeof found?.uptime_7d_pct).toBe("number");
      expect(typeof found?.uptime_30d_pct).toBe("number");
    }
    expect(body.recent_incidents).toEqual([]);
    expect(typeof body.last_updated).toBe("string");
    // Cache header advertises 60s.
    expect(res.headers.get("Cache-Control")).toContain("max-age=60");
  });

  it("returns 200 (not 500) when the database probe throws", async () => {
    process.env.DATABASE_URL = "postgres://broken";
    mockQuery.mockRejectedValue(new Error("ECONNREFUSED"));

    const res = await GET();
    expect(res.status).toBe(200);

    const body = (await res.json()) as StatusPayload;
    const db = body.components.find((c) => c.name === "Database");
    expect(db).toBeTruthy();
    expect(db?.status).toBe("degraded");
    // Rollup must reflect at least degraded.
    expect(["degraded", "major_outage"]).toContain(body.overall);
  });

  it("returns 200 with status info even when EVERY component is down", async () => {
    // Strip all the env vars so each probe reports degraded.
    delete process.env.DATABASE_URL;
    delete process.env.QDRANT_URL;
    delete process.env.NEO4J_URL;
    delete process.env.NEO4J_URI;
    delete process.env.FAL_API_KEY;
    delete process.env.RESEND_API_KEY;
    mockQuery.mockRejectedValue(new Error("not configured"));

    const res = await GET();
    expect(res.status).toBe(200);

    const body = (await res.json()) as StatusPayload;
    expect(body.components).toHaveLength(STATUS_COMPONENT_NAMES.length);
    // API itself is always reported (the handler is running).
    const api = body.components.find((c) => c.name === "API");
    expect(api?.status).toBe("operational");
    // All other components degrade.
    const otherDegraded = body.components
      .filter((c) => c.name !== "API")
      .every((c) => c.status === "degraded");
    expect(otherDegraded).toBe(true);
    expect(body.overall).toBe("degraded");
  });

  it("caches results for 60 seconds (second call does not re-probe)", async () => {
    process.env.DATABASE_URL = "postgres://test";
    process.env.QDRANT_URL = "http://qdrant:6333";
    process.env.NEO4J_URL = "http://neo4j:7474";
    process.env.FAL_API_KEY = "fal-key";
    process.env.RESEND_API_KEY = "resend-key";
    mockQuery.mockResolvedValue({ rows: [] });

    const first = await GET();
    const firstBody = (await first.json()) as StatusPayload;
    const firstCallCount = mockQuery.mock.calls.length;

    const second = await GET();
    const secondBody = (await second.json()) as StatusPayload;
    const secondCallCount = mockQuery.mock.calls.length;

    expect(second.status).toBe(200);
    // No additional DB probe should fire — payload is served from cache.
    expect(secondCallCount).toBe(firstCallCount);
    expect(secondBody.last_updated).toBe(firstBody.last_updated);
  });

  it("returns the exact six contract component names", () => {
    expect(STATUS_COMPONENT_NAMES).toEqual([
      "API",
      "Database",
      "Search",
      "Graph",
      "Background Jobs",
      "Email Delivery",
    ]);
  });

  it("never throws when fetch itself rejects (Qdrant/Neo4j unreachable)", async () => {
    process.env.DATABASE_URL = "postgres://test";
    process.env.QDRANT_URL = "http://qdrant:6333";
    process.env.NEO4J_URL = "http://neo4j:7474";
    process.env.FAL_API_KEY = "fal-key";
    process.env.RESEND_API_KEY = "resend-key";
    mockQuery.mockResolvedValue({ rows: [] });
    global.fetch = jest.fn(async () => {
      throw new Error("network unreachable");
    }) as unknown as typeof fetch;

    const res = await GET();
    expect(res.status).toBe(200);
    const body = (await res.json()) as StatusPayload;
    const search = body.components.find((c) => c.name === "Search");
    const graph = body.components.find((c) => c.name === "Graph");
    expect(search?.status).toBe("degraded");
    expect(graph?.status).toBe("degraded");
    // Rollup should be degraded, not crash.
    expect(["degraded", "major_outage"]).toContain(body.overall);
  });
});
