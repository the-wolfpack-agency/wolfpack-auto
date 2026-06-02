/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * analytics-hooks — page column regression guard.
 *
 * BUG (fixed 2026-06-02): persistEvent() was inserting dealer_id into
 * the `page` column, polluting analytics_events.page with UUIDs and
 * breaking the heatmap page dropdown.
 *
 * Fix: page column = String(metadata.page ?? "(server)").
 *      dealer_id stays ONLY in the metadata JSON.
 *
 * This test pins that contract so the regression cannot reappear.
 */

const mockQuery = jest.fn();

jest.mock("@/lib/db", () => ({
  query: (...args: any[]) => mockQuery(...args),
}));

// Silence external side-effects (Plausible, webhooks) during unit tests
jest.mock("@/lib/analytics", () => ({
  trackServerEvent: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("@/lib/webhook-outbound", () => ({
  dispatchWebhooks: jest.fn().mockResolvedValue(undefined),
}));

beforeEach(() => {
  mockQuery.mockReset().mockResolvedValue({ rows: [] });
  process.env.DATABASE_URL = "postgres://test";
});

afterAll(() => {
  delete process.env.DATABASE_URL;
});

// Import after mocks are registered
import { trackHeatmap, trackDeal, trackSystem } from "@/lib/analytics-hooks";

/**
 * Helper: extract the positional args passed to the INSERT query.
 * The query is:
 *   INSERT INTO analytics_events (event_type, action, page, session_id, user_fingerprint, metadata, timestamp)
 *   VALUES ($1, $2, $3, $4, $5, $6, NOW())
 *
 * $3 is `page`, $6 is `metadata` (JSON string).
 */
function getCapturedInsertArgs(): any[] {
  // Find the call that contains the INSERT statement
  const call = mockQuery.mock.calls.find(
    ([sql]: [string]) => typeof sql === "string" && sql.includes("INSERT INTO analytics_events"),
  );
  expect(call).toBeDefined();
  return call![1] as any[];
}

/* ------------------------------------------------------------------ */
/*  Core contract: page column must never be a UUID                    */
/* ------------------------------------------------------------------ */

describe("persistEvent — page column", () => {
  const DEALER_UUID = "550e8400-e29b-41d4-a716-446655440000";

  test("trackDeal without a page in metadata writes '(server)' to the page column", async () => {
    trackDeal("deal.created", DEALER_UUID, { deal_type: "retail" });

    // Let the fire-and-forget Promise settle
    await new Promise((r) => setTimeout(r, 10));

    const args = getCapturedInsertArgs();
    const pageArg = args[2]; // $3 = page

    // Must NOT be the dealer UUID
    expect(pageArg).not.toBe(DEALER_UUID);
    // Must be the default server sentinel
    expect(pageArg).toBe("(server)");
  });

  test("dealer_id is present in the metadata JSON, NOT in the page column", async () => {
    trackDeal("deal.created", DEALER_UUID, { deal_type: "lease" });

    await new Promise((r) => setTimeout(r, 10));

    const args = getCapturedInsertArgs();
    const pageArg = args[2];        // $3 = page
    const metadataJson = args[5];   // $6 = metadata JSON string

    expect(pageArg).not.toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );

    const metadata = JSON.parse(metadataJson);
    expect(metadata.dealer_id).toBe(DEALER_UUID);
  });

  test("trackHeatmap with page in metadata writes the real page path to the page column", async () => {
    trackHeatmap("heatmap.viewed", DEALER_UUID, {
      page: "/inventory",
      heatmap_id: "hm-123",
    });

    await new Promise((r) => setTimeout(r, 10));

    const args = getCapturedInsertArgs();
    const pageArg = args[2]; // $3 = page

    expect(pageArg).toBe("/inventory");
    // Also not the dealer UUID
    expect(pageArg).not.toBe(DEALER_UUID);
  });

  test("metadata.page value overrides the '(server)' fallback", async () => {
    trackSystem("system.health_check", DEALER_UUID, {
      page: "/admin/dashboard",
      status: "ok",
    });

    await new Promise((r) => setTimeout(r, 10));

    const args = getCapturedInsertArgs();
    expect(args[2]).toBe("/admin/dashboard");
  });

  test("page column value is a string in all cases", async () => {
    trackDeal("deal.created", DEALER_UUID, {});

    await new Promise((r) => setTimeout(r, 10));

    const args = getCapturedInsertArgs();
    expect(typeof args[2]).toBe("string");
  });

  test("shadow mode (no DATABASE_URL) skips DB write without throwing", async () => {
    delete process.env.DATABASE_URL;

    expect(() => {
      trackDeal("deal.created", DEALER_UUID, { deal_type: "retail" });
    }).not.toThrow();

    await new Promise((r) => setTimeout(r, 10));

    // No INSERT should have fired
    const insertCall = mockQuery.mock.calls.find(
      ([sql]: [string]) => typeof sql === "string" && sql.includes("INSERT INTO analytics_events"),
    );
    expect(insertCall).toBeUndefined();

    // Restore for subsequent tests
    process.env.DATABASE_URL = "postgres://test";
  });
});

/* ------------------------------------------------------------------ */
/*  trackHeatmap path — the primary heatmap.viewed caller              */
/* ------------------------------------------------------------------ */

describe("trackHeatmap — page column contract", () => {
  const DEALER_UUID = "aaaabbbb-cccc-dddd-eeee-ffffaaaabbbb";

  test("heatmap.viewed with page '/inventory' → page column = '/inventory'", async () => {
    trackHeatmap("heatmap.viewed", DEALER_UUID, { page: "/inventory" });

    await new Promise((r) => setTimeout(r, 10));

    const args = getCapturedInsertArgs();
    expect(args[2]).toBe("/inventory");
  });

  test("heatmap.generated without page → page column = '(server)'", async () => {
    trackHeatmap("heatmap.generated", DEALER_UUID, { generated_count: 5 });

    await new Promise((r) => setTimeout(r, 10));

    const args = getCapturedInsertArgs();
    expect(args[2]).toBe("(server)");
  });

  test("heatmap.exported with page '/admin/heatmaps' → page column matches", async () => {
    trackHeatmap("heatmap.exported", DEALER_UUID, {
      page: "/admin/heatmaps",
      format: "png",
    });

    await new Promise((r) => setTimeout(r, 10));

    const args = getCapturedInsertArgs();
    expect(args[2]).toBe("/admin/heatmaps");
    // Dealer UUID must NOT appear in page column
    expect(args[2]).not.toBe(DEALER_UUID);
  });

  test("dealer_id is in metadata JSON for all heatmap events", async () => {
    trackHeatmap("heatmap.viewed", DEALER_UUID, { page: "/vdp/vin123" });

    await new Promise((r) => setTimeout(r, 10));

    const args = getCapturedInsertArgs();
    const metadata = JSON.parse(args[5]);
    expect(metadata.dealer_id).toBe(DEALER_UUID);
  });
});
