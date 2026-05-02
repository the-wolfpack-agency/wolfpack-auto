/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * /api/analytics/events — dealer_id stamping regression guard.
 *
 * On 2026-05-02 the heatmap surface showed zero clicks despite real
 * Playwright traffic because every dealer-scoped query filters by
 * `metadata->>'dealer_id'`, but the client EventCollector never
 * included it in metadata. The fix: the ingest endpoint resolves
 * dealer from the request hostname via tenant-resolver and stamps
 * `dealer_id` into every event's metadata before persistence.
 *
 * This test pins that contract so the regression doesn't reappear.
 */

const mockResolveTenant = jest.fn();
const mockIngestEvents = jest.fn();
const mockPersist = jest.fn();
const mockSecondary = jest.fn();
const mockRunPipeline = jest.fn();
const mockEnsureTable = jest.fn();
const mockQuery = jest.fn();
const mockLogDataflow = jest.fn();

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

beforeEach(() => {
  mockResolveTenant.mockReset();
  mockIngestEvents.mockReset().mockReturnValue({ accepted: 1 });
  mockPersist.mockReset();
  mockSecondary.mockReset().mockResolvedValue(undefined);
  mockRunPipeline.mockReset().mockResolvedValue(null);
  mockEnsureTable.mockReset();
  mockQuery.mockReset().mockResolvedValue({ rows: [] });
  mockLogDataflow.mockReset();
  process.env.DATABASE_URL = "postgres://test";
});

import { NextRequest } from "next/server";
import { POST } from "../route";

function makePost(body: unknown, host = "wolfpack-auto.vercel.app"): NextRequest {
  return new NextRequest("https://x.test/api/analytics/events", {
    method: "POST",
    headers: { host, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/analytics/events — dealer_id stamping", () => {
  test("stamps tenant.dealer.id from resolveTenant onto every event missing dealer_id", async () => {
    mockResolveTenant.mockResolvedValueOnce({
      dealer: { id: "dealer-abc", slug: "acme" },
      resolvedVia: "custom_domain",
    });

    const events = [
      {
        event_type: "click",
        action: "click",
        page: "/",
        session_id: "s1",
        user_fingerprint: "fp1",
        timestamp: "2026-05-02T20:00:00Z",
        metadata: { x: 100, y: 200 },
      },
      {
        event_type: "scroll",
        action: "scroll_50",
        page: "/",
        session_id: "s1",
        user_fingerprint: "fp1",
        timestamp: "2026-05-02T20:00:01Z",
        metadata: {},
      },
    ];

    const res = await POST(makePost({ events }));
    expect(res.status).toBe(200);

    /* Both events that hit ingestEvents must have dealer_id set. */
    const ingested = mockIngestEvents.mock.calls[0][0];
    expect(ingested).toHaveLength(2);
    for (const ev of ingested) {
      expect(ev.metadata.dealer_id).toBe("dealer-abc");
    }
    /* Original event-specific metadata is preserved. */
    expect(ingested[0].metadata.x).toBe(100);
    expect(ingested[0].metadata.y).toBe(200);
  });

  test("does NOT overwrite a dealer_id the client already set", async () => {
    mockResolveTenant.mockResolvedValueOnce({
      dealer: { id: "dealer-from-host" },
      resolvedVia: "custom_domain",
    });
    const events = [
      {
        event_type: "click",
        action: "click",
        page: "/",
        session_id: "s1",
        user_fingerprint: "fp1",
        metadata: { dealer_id: "dealer-explicit" },
      },
    ];
    const res = await POST(makePost({ events }));
    expect(res.status).toBe(200);
    const ingested = mockIngestEvents.mock.calls[0][0];
    expect(ingested[0].metadata.dealer_id).toBe("dealer-explicit");
  });

  test("when resolveTenant returns null (Vercel deploy host etc), dealer_id falls back to the default UUID — symmetric with getDealerId on the query side", async () => {
    mockResolveTenant.mockResolvedValueOnce(null);
    const events = [
      {
        event_type: "click",
        action: "click",
        page: "/",
        session_id: "s1",
        user_fingerprint: "fp1",
        metadata: {},
      },
    ];
    const res = await POST(makePost({ events }));
    expect(res.status).toBe(200);
    const ingested = mockIngestEvents.mock.calls[0][0];
    /* Must match the heatmap query's default fallback (the demo dealer
       UUID returned by getDealerId when no session dealer_id exists). */
    expect(ingested[0].metadata.dealer_id).toBe(
      "00000000-0000-4000-a000-000000000001",
    );
  });

  test("when resolveTenant throws, ingest still proceeds (graceful degradation)", async () => {
    mockResolveTenant.mockRejectedValueOnce(new Error("redis down"));
    const events = [
      {
        event_type: "click",
        action: "click",
        page: "/",
        session_id: "s1",
        user_fingerprint: "fp1",
        metadata: {},
      },
    ];
    const res = await POST(makePost({ events }));
    expect(res.status).toBe(200);
    expect(mockIngestEvents).toHaveBeenCalledTimes(1);
  });
});
