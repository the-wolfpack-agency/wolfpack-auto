/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * /api/analytics/events — anonymous heatmap event ingest guard.
 *
 * New anon heatmap events arrive with:
 *   event_type: "heatmap_click" | "heatmap_move"
 *   session_id: "anon"
 *   user_fingerprint: "anon"
 *   metadata: { xp: 0..1, yp: 0..1, vw: <number>, src: "anon_heatmap" }
 *
 * Contracts enforced:
 *   1. Returns 200 + accepted > 0 for valid anon heatmap batches.
 *   2. dealer_id is stamped onto every event's metadata (tenant isolation).
 *   3. Rate limit still enforced — N+1 calls from the same IP → 429.
 *   4. Malformed coords (NaN, Infinity, out-of-range) don't 500.
 *   5. No PII required — anon session/fingerprint is accepted.
 */

const mockResolveTenant = jest.fn();
const mockIngestEvents = jest.fn();
const mockQuery = jest.fn();
const mockSecondary = jest.fn();
const mockRunPipeline = jest.fn();

jest.mock("@/lib/tenant-resolver", () => ({
  resolveTenant: (...a: any[]) => mockResolveTenant(...a),
}));
jest.mock("@/lib/analytics-engine", () => ({
  ingestEvents: (...a: any[]) => mockIngestEvents(...a),
  runAggregationPipeline: (...a: any[]) => mockRunPipeline(...a),
  getBufferStats: () => ({ size: 0, capacity: 100 }),
}));
jest.mock("@/lib/triple-write", () => ({
  writeEventsToSecondaryStores: (...a: any[]) => mockSecondary(...a),
}));
jest.mock("@/lib/db", () => ({
  query: (...a: any[]) => mockQuery(...a),
}));
jest.mock("@/lib/dataflow-health", () => ({
  recordPgWrite: jest.fn(),
  getDataflowWarnings: () => [],
  getPgWriteStats: () => ({ ok: 0, err: 0 }),
}));

import { NextRequest } from "next/server";
import { POST } from "../route";

/* ------------------------------------------------------------------ */
/*  Helpers                                                             */
/* ------------------------------------------------------------------ */

const DEALER_UUID = "ccccdddd-eeee-4000-aaaa-bbbbccccdddd";

function makePost(
  body: unknown,
  host = "dealer.example.com",
  ip = "10.0.0.1",
): NextRequest {
  return new NextRequest("https://dealer.example.com/api/analytics/events", {
    method: "POST",
    headers: {
      host,
      "content-type": "application/json",
      "x-forwarded-for": ip,
    },
    body: JSON.stringify(body),
  });
}

function anonClick(overrides: Record<string, unknown> = {}) {
  return {
    event_type: "heatmap_click",
    action: "heatmap_click",
    page: "/inventory",
    session_id: "anon",
    user_fingerprint: "anon",
    timestamp: new Date().toISOString(),
    metadata: { xp: 0.42, yp: 0.77, vw: 1440, src: "anon_heatmap", ...overrides },
  };
}

function anonMove(overrides: Record<string, unknown> = {}) {
  return {
    event_type: "heatmap_move",
    action: "heatmap_move",
    page: "/inventory",
    session_id: "anon",
    user_fingerprint: "anon",
    timestamp: new Date().toISOString(),
    metadata: { xp: 0.1, yp: 0.9, vw: 1440, src: "anon_heatmap", ...overrides },
  };
}

/* Each test gets a fresh rate-limit state by varying the IP. */
let ipCounter = 1;
function freshIp(): string {
  return `192.168.${Math.floor(ipCounter / 255)}.${ipCounter++ % 255 || 1}`;
}

/* ------------------------------------------------------------------ */
/*  Setup / teardown                                                    */
/* ------------------------------------------------------------------ */

beforeEach(() => {
  mockResolveTenant.mockReset().mockResolvedValue({
    dealer: { id: DEALER_UUID },
    resolvedVia: "custom_domain",
  });
  mockIngestEvents.mockReset().mockReturnValue({ accepted: 2 });
  mockQuery.mockReset().mockResolvedValue({ rows: [] });
  mockSecondary.mockReset().mockResolvedValue(undefined);
  mockRunPipeline.mockReset().mockResolvedValue(null);
  process.env.DATABASE_URL = "postgres://test";
});

/* ------------------------------------------------------------------ */
/*  1. Basic acceptance                                                 */
/* ------------------------------------------------------------------ */

describe("heatmap_click / heatmap_move ingest — basic acceptance", () => {
  test("returns 200 for a valid batch of anon heatmap_click events", async () => {
    const ip = freshIp();
    const res = await POST(makePost({ events: [anonClick(), anonClick()] }, undefined, ip));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.accepted).toBeGreaterThan(0);
  });

  test("returns 200 for a valid batch of anon heatmap_move events", async () => {
    const ip = freshIp();
    const res = await POST(makePost({ events: [anonMove(), anonMove()] }, undefined, ip));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.accepted).toBeGreaterThan(0);
  });

  test("returns 200 for a mixed batch of heatmap_click and heatmap_move", async () => {
    const ip = freshIp();
    const res = await POST(
      makePost({ events: [anonClick(), anonMove(), anonClick()] }, undefined, ip),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.accepted).toBeGreaterThan(0);
  });

  test("accepts anon session_id and user_fingerprint — no PII required", async () => {
    const ip = freshIp();
    const res = await POST(
      makePost(
        {
          events: [
            {
              ...anonClick(),
              session_id: "anon",
              user_fingerprint: "anon",
            },
          ],
        },
        undefined,
        ip,
      ),
    );
    expect(res.status).toBe(200);
  });
});

/* ------------------------------------------------------------------ */
/*  2. dealer_id stamping (tenant isolation)                           */
/* ------------------------------------------------------------------ */

describe("heatmap ingest — dealer_id stamping", () => {
  test("dealer_id is stamped onto every anon heatmap event's metadata", async () => {
    const ip = freshIp();
    await POST(makePost({ events: [anonClick(), anonMove()] }, undefined, ip));

    const ingested = mockIngestEvents.mock.calls[0][0];
    expect(ingested).toHaveLength(2);
    for (const ev of ingested) {
      expect(ev.metadata.dealer_id).toBe(DEALER_UUID);
    }
  });

  test("dealer_id from tenant resolution takes precedence over default", async () => {
    const ip = freshIp();
    const CUSTOM_DEALER = "11112222-3333-4444-5555-666677778888";
    mockResolveTenant.mockResolvedValueOnce({ dealer: { id: CUSTOM_DEALER } });

    await POST(makePost({ events: [anonClick()] }, "custom.dealer.com", ip));

    const ingested = mockIngestEvents.mock.calls[0][0];
    expect(ingested[0].metadata.dealer_id).toBe(CUSTOM_DEALER);
  });

  test("falls back to default dealer_id when resolveTenant returns null", async () => {
    const ip = freshIp();
    mockResolveTenant.mockResolvedValueOnce(null);
    process.env.DEALER_ID = "default-dealer-uuid";

    await POST(makePost({ events: [anonClick()] }, undefined, ip));

    const ingested = mockIngestEvents.mock.calls[0][0];
    expect(ingested[0].metadata.dealer_id).toBe("default-dealer-uuid");

    delete process.env.DEALER_ID;
  });

  test("stamping does not overwrite an explicit dealer_id already in event metadata", async () => {
    const ip = freshIp();
    const EXPLICIT = "explicit-dealer-id";
    const event = anonClick({ dealer_id: EXPLICIT });

    await POST(makePost({ events: [event] }, undefined, ip));

    const ingested = mockIngestEvents.mock.calls[0][0];
    expect(ingested[0].metadata.dealer_id).toBe(EXPLICIT);
  });
});

/* ------------------------------------------------------------------ */
/*  3. Rate limit still enforced                                        */
/* ------------------------------------------------------------------ */

describe("heatmap ingest — rate limit", () => {
  test("200 up to the rate limit, then 429 on the next request", async () => {
    // The route's in-memory limit is 200 req/min per IP.
    // We cannot burn 200 real calls in a unit test — instead we verify
    // the 429 path fires when the limit is hit by making 201 calls.
    // This is slow so we use a dedicated IP to avoid cross-test bleed.
    const ip = `10.99.99.99`;

    // Make 200 calls — all should pass
    for (let i = 0; i < 200; i++) {
      const res = await POST(
        makePost({ events: [anonClick()] }, undefined, ip),
      );
      expect(res.status).toBe(200);
    }

    // 201st call should be rate-limited
    const res = await POST(makePost({ events: [anonClick()] }, undefined, ip));
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error).toBe("rate_limited");
  }, 30_000); // allow up to 30s for 201 async calls
});

/* ------------------------------------------------------------------ */
/*  4. Malformed coord handling — must not 500                         */
/* ------------------------------------------------------------------ */

describe("heatmap ingest — malformed coord sanitisation", () => {
  test("NaN coords do not cause a 500", async () => {
    const ip = freshIp();
    const res = await POST(
      makePost({ events: [anonClick({ xp: NaN, yp: NaN })] }, undefined, ip),
    );
    expect(res.status).toBe(200);
  });

  test("Infinity coords do not cause a 500", async () => {
    const ip = freshIp();
    const res = await POST(
      makePost({ events: [anonClick({ xp: Infinity, yp: -Infinity })] }, undefined, ip),
    );
    expect(res.status).toBe(200);
  });

  test("out-of-range coords are clamped, not rejected", async () => {
    const ip = freshIp();
    // xp=5 should be clamped to 1; yp=-3 should be clamped to 0
    await POST(makePost({ events: [anonClick({ xp: 5, yp: -3 })] }, undefined, ip));

    const ingested = mockIngestEvents.mock.calls[0][0];
    expect(ingested[0].metadata.xp).toBe(1);
    expect(ingested[0].metadata.yp).toBe(0);
  });

  test("valid coords in [0,1] are preserved as-is", async () => {
    const ip = freshIp();
    await POST(makePost({ events: [anonClick({ xp: 0.42, yp: 0.77 })] }, undefined, ip));

    const ingested = mockIngestEvents.mock.calls[0][0];
    expect(ingested[0].metadata.xp).toBeCloseTo(0.42);
    expect(ingested[0].metadata.yp).toBeCloseTo(0.77);
  });

  test("string coords are stripped, not propagated", async () => {
    const ip = freshIp();
    await POST(
      makePost({ events: [anonClick({ xp: "bad" as any, yp: "also-bad" as any })] }, undefined, ip),
    );

    const ingested = mockIngestEvents.mock.calls[0][0];
    expect(ingested[0].metadata.xp).toBeUndefined();
    expect(ingested[0].metadata.yp).toBeUndefined();
    // Must still be 200
    // (We check the return above via mockIngestEvents being called)
    expect(mockIngestEvents).toHaveBeenCalledTimes(1);
  });

  test("malformed coord events do not block valid events in the same batch", async () => {
    const ip = freshIp();
    const res = await POST(
      makePost(
        {
          events: [
            anonClick({ xp: NaN, yp: Infinity }),
            anonClick({ xp: 0.5, yp: 0.5 }),
          ],
        },
        undefined,
        ip,
      ),
    );
    expect(res.status).toBe(200);
    const ingested = mockIngestEvents.mock.calls[0][0];
    // Both events reach ingest (sanitised, not dropped)
    expect(ingested).toHaveLength(2);
  });
});

/* ------------------------------------------------------------------ */
/*  5. Standard error paths still work                                 */
/* ------------------------------------------------------------------ */

describe("heatmap ingest — standard error paths", () => {
  test("empty events array returns 400", async () => {
    const ip = freshIp();
    const res = await POST(makePost({ events: [] }, undefined, ip));
    expect(res.status).toBe(400);
  });

  test("missing events key returns 400", async () => {
    const ip = freshIp();
    const res = await POST(makePost({}, undefined, ip));
    expect(res.status).toBe(400);
  });
});
