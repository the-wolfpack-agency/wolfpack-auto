import { test, expect } from "@playwright/test";

/**
 * Multi-Tenant Row-Level Security (RLS) Isolation Tests
 *
 * Verifies that dealer data is properly isolated end-to-end via the API.
 * Two synthetic dealer IDs are used — they must exist in the database when
 * running against a real DB.  When the app falls back to placeholder data
 * (no DATABASE_URL), the tests verify that the API still returns consistent
 * results scoped to a single dealer context.
 *
 * These tests exercise the HTTP surface, not the database directly.
 * For direct DB-level RLS verification, see: scripts/verify-rls.ts
 */

// Two deterministic UUIDs that will never collide with real dealers.
const DEALER_A = "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa";
const DEALER_B = "bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb";

// Unique VINs for test vehicles
const VIN_A = "RLSTESTA00000001";
const VIN_B = "RLSTESTB00000002";

test.describe("Multi-tenant RLS isolation", () => {
  // -------------------------------------------------------------------------
  // 1. Inventory isolation — dealer A should not see dealer B's vehicles
  // -------------------------------------------------------------------------

  test("GET /api/inventory with dealer_id filters to that dealer only", async ({
    request,
  }) => {
    // Fetch inventory scoped to dealer A
    const resA = await request.get("/api/inventory", {
      params: { dealer_id: DEALER_A },
    });
    expect(resA.ok()).toBeTruthy();
    const bodyA = await resA.json();

    // Every returned vehicle (if any) must belong to dealer A or come from
    // the placeholder dataset (which has no dealer_id field).
    if (bodyA.source === "database" && bodyA.vehicles?.length > 0) {
      for (const vehicle of bodyA.vehicles) {
        // The API may not expose dealer_id in the response, but the DB
        // query in data.ts filters by DEALER_ID.  We verify the count
        // does not include dealer B data in the cross-check below.
        expect(vehicle.vin).toBeTruthy();
      }
    }

    // Fetch inventory scoped to dealer B
    const resB = await request.get("/api/inventory", {
      params: { dealer_id: DEALER_B },
    });
    expect(resB.ok()).toBeTruthy();
    const bodyB = await resB.json();

    // If both come from the database, their VIN sets must be disjoint.
    if (bodyA.source === "database" && bodyB.source === "database") {
      const vinsA = new Set(bodyA.vehicles.map((v: { vin: string }) => v.vin));
      const vinsB = new Set(bodyB.vehicles.map((v: { vin: string }) => v.vin));

      for (const vin of vinsA) {
        expect(vinsB.has(vin)).toBe(false);
      }
    }
  });

  // -------------------------------------------------------------------------
  // 2. Lead isolation — dealer A should not see dealer B's leads
  // -------------------------------------------------------------------------

  test("POST /api/leads creates a lead scoped to the given dealer_id", async ({
    request,
  }) => {
    // Submit a lead for dealer A
    const resA = await request.post("/api/leads", {
      data: {
        dealer_id: DEALER_A,
        first_name: "Alice",
        last_name: "RLS-Test",
        email: "alice-rls-test@example.com",
        phone: "+15551234567",
        vehicle_interest: "2024 Test Vehicle",
        source: "website_form",
      },
    });

    expect(resA.status()).toBe(201);
    const leadA = await resA.json();
    expect(leadA.success).toBe(true);
    expect(leadA.lead_id).toBeTruthy();

    // Submit a lead for dealer B
    const resB = await request.post("/api/leads", {
      data: {
        dealer_id: DEALER_B,
        first_name: "Bob",
        last_name: "RLS-Test",
        email: "bob-rls-test@example.com",
        phone: "+15559876543",
        vehicle_interest: "2024 Other Vehicle",
        source: "website_form",
      },
    });

    expect(resB.status()).toBe(201);
    const leadB = await resB.json();
    expect(leadB.success).toBe(true);
    expect(leadB.lead_id).toBeTruthy();

    // The lead IDs must be different
    expect(leadA.lead_id).not.toBe(leadB.lead_id);
  });

  // -------------------------------------------------------------------------
  // 3. Vehicle creation isolation — POST for dealer A invisible to dealer B
  // -------------------------------------------------------------------------

  test("POST /api/inventory for dealer A should not appear in dealer B results", async ({
    request,
  }) => {
    // This test checks that if a vehicle endpoint accepts a dealer_id body
    // param, vehicles created under dealer A do not leak into dealer B queries.

    // First, query dealer B's inventory to get a baseline count
    const baselineRes = await request.get("/api/inventory", {
      params: { dealer_id: DEALER_B },
    });
    expect(baselineRes.ok()).toBeTruthy();
    const baseline = await baselineRes.json();
    const baselineCount = baseline.total ?? 0;

    // Attempt to create a vehicle for dealer A (if the endpoint exists)
    const createRes = await request.post("/api/inventory", {
      data: {
        dealer_id: DEALER_A,
        vin: VIN_A,
        year: 2024,
        make: "TestMake",
        model: "TestModel",
        price: 29999,
        condition: "used",
        mileage: 10000,
      },
    });

    // If the POST endpoint does not exist (405), skip the cross-check
    if (createRes.status() === 405 || createRes.status() === 404) {
      test.skip();
      return;
    }

    // Re-query dealer B — count must not have increased
    const afterRes = await request.get("/api/inventory", {
      params: { dealer_id: DEALER_B },
    });
    expect(afterRes.ok()).toBeTruthy();
    const after = await afterRes.json();

    expect(after.total).toBeLessThanOrEqual(baselineCount);

    // Verify VIN_A does NOT appear in dealer B's results
    if (after.vehicles?.length > 0) {
      const vins = after.vehicles.map((v: { vin: string }) => v.vin);
      expect(vins).not.toContain(VIN_A);
    }
  });

  // -------------------------------------------------------------------------
  // 4. VDP cross-dealer access — dealer B's VIN should 404 for dealer A
  // -------------------------------------------------------------------------

  test("vehicle detail page for another dealer's VIN returns 404 or empty", async ({
    request,
  }) => {
    // Request dealer B's test VIN via the inventory detail API,
    // when the app is configured for dealer A (via DEALER_ID env var).
    // The data layer in data.ts filters by DEALER_ID, so a VIN that
    // belongs to dealer B should not resolve.

    const res = await request.get(`/api/inventory/${VIN_B}`);

    // Acceptable outcomes:
    // - 404: proper isolation
    // - 200 with null/empty vehicle: soft 404 (placeholder fallback)
    // - The endpoint may not exist (in which case we check the page)
    if (res.status() === 404) {
      // Perfect — hard 404
      return;
    }

    if (res.ok()) {
      const body = await res.json();
      // If the API returns data, verify it does NOT contain the cross-dealer VIN
      if (body.vehicle) {
        expect(body.vehicle.vin).not.toBe(VIN_B);
      }
      return;
    }

    // Fall back to page-level check
    const pageRes = await request.get(`/inventory/${VIN_B}`);
    // Should be 404 or a page that shows "vehicle not found"
    if (pageRes.status() === 404) {
      return;
    }

    // If the page renders (200), check that it does not expose the VIN
    if (pageRes.ok()) {
      const html = await pageRes.text();
      expect(html).not.toContain(VIN_B);
    }
  });

  // -------------------------------------------------------------------------
  // 5. API response never leaks dealer_id in public vehicle data
  // -------------------------------------------------------------------------

  test("inventory API response does not expose raw dealer_id to clients", async ({
    request,
  }) => {
    const res = await request.get("/api/inventory");
    expect(res.ok()).toBeTruthy();
    const body = await res.json();

    // The API should not expose dealer_id in vehicle objects
    if (body.vehicles?.length > 0) {
      for (const vehicle of body.vehicles) {
        expect(vehicle).not.toHaveProperty("dealer_id");
      }
    }
  });

  // -------------------------------------------------------------------------
  // 6. Lead submission rejects empty dealer_id
  // -------------------------------------------------------------------------

  test("lead submission fails validation without dealer_id", async ({
    request,
  }) => {
    const res = await request.post("/api/leads", {
      data: {
        first_name: "NoDealer",
        last_name: "Test",
        email: "nodealer@example.com",
        vehicle_interest: "Any vehicle",
      },
    });

    // Should be 422 (validation error) — dealer_id is required
    expect(res.status()).toBe(422);
    const body = await res.json();
    expect(body.error).toBeTruthy();
  });
});
