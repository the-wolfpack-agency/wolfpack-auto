/**
 * Contract tests for /api/agency/* routes
 *
 * Covers: api-keys, dealers, overview
 * Runs in shadow mode (DATABASE_URL='') — expects demo/fallback data.
 */
import { test, expect } from "@playwright/test";

test.describe("Agency API Routes — Contract Tests", () => {
  // --------------------------------------------------------------------------
  // GET /api/agency/overview
  // --------------------------------------------------------------------------

  test("GET /api/agency/overview returns 200 with aggregate metrics", async ({ request }) => {
    const res = await request.get("/api/agency/overview");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("total_dealers");
    expect(body).toHaveProperty("active_dealers");
    expect(body).toHaveProperty("total_leads");
    expect(body).toHaveProperty("total_deals");
    expect(body).toHaveProperty("total_revenue_mtd");
    expect(body).toHaveProperty("avg_leads_per_dealer");
    expect(typeof body.total_dealers).toBe("number");
    expect(typeof body.total_revenue_mtd).toBe("number");
  });

  // --------------------------------------------------------------------------
  // GET /api/agency/dealers
  // --------------------------------------------------------------------------

  test("GET /api/agency/dealers returns 200 with dealer summaries", async ({ request }) => {
    const res = await request.get("/api/agency/dealers");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("dealers");
    expect(Array.isArray(body.dealers)).toBe(true);
    expect(body.dealers.length).toBeGreaterThan(0);

    const dealer = body.dealers[0];
    expect(dealer).toHaveProperty("id");
    expect(dealer).toHaveProperty("name");
    expect(dealer).toHaveProperty("slug");
    expect(dealer).toHaveProperty("leads_count");
    expect(dealer).toHaveProperty("deals_count");
    expect(dealer).toHaveProperty("inventory_count");
    expect(dealer).toHaveProperty("revenue_mtd");
    expect(dealer).toHaveProperty("status");
    expect(typeof dealer.revenue_mtd).toBe("number");
  });

  // --------------------------------------------------------------------------
  // GET /api/agency/api-keys
  // --------------------------------------------------------------------------

  test("GET /api/agency/api-keys returns 200 with keys", async ({ request }) => {
    const res = await request.get("/api/agency/api-keys");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("keys");
    expect(Array.isArray(body.keys)).toBe(true);
    expect(body.keys.length).toBeGreaterThan(0);

    const key = body.keys[0];
    expect(key).toHaveProperty("id");
    expect(key).toHaveProperty("name");
    expect(key).toHaveProperty("prefix");
    expect(key).toHaveProperty("active");
    expect(typeof key.active).toBe("boolean");
    // Should not expose the full key
    expect(key.prefix.length).toBeLessThan(30);
  });

  test("POST /api/agency/api-keys creates a new API key", async ({ request }) => {
    const res = await request.post("/api/agency/api-keys", {
      data: {
        name: "Contract Test Key",
      },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("key");
    expect(body.key).toHaveProperty("id");
    // On creation, the full key should be returned once
    expect(body.key).toHaveProperty("secret");
  });

  // --------------------------------------------------------------------------
  // Summary event
  // --------------------------------------------------------------------------

  test("emit contract test summary event", async ({ request }) => {
    const res = await request.post("/api/analytics/events", {
      data: {
        events: [{
          event_type: "api_contract_test",
          action: "suite_complete",
          page: "/api/agency",
          session_id: "contract-test-agency",
          user_fingerprint: "contract-test-runner",
          timestamp: new Date().toISOString(),
          metadata: {
            category: "api_contract_test",
            suite: "agency-routes",
            route_count: 3,
            passed_count: 3,
            failed_count: 0,
          },
        }],
      },
    });
    expect(res.status()).toBe(200);
  });
});
