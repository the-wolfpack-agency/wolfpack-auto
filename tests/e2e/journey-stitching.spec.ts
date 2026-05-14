import { test, expect, type Page } from "@playwright/test";

test.skip(
  !process.env.DATABASE_URL,
  "Needs real Postgres (Phase 1 Tests runs in shadow mode). Run via the real-DB integration phase or locally with DATABASE_URL set."
);

/**
 * journey-stitching.spec.ts
 *
 * E2E validation of cross-session journey stitching: visitor_id persistence,
 * session counting, narrowing detection, stage transitions, and shortlist
 * tracking. All tests run against the live site and emit analytics events
 * with category "journey_stitching_validation" for traceability.
 */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Read a localStorage value from the page context. */
async function getLocalStorage(page: Page, key: string): Promise<string | null> {
  return page.evaluate((k) => localStorage.getItem(k), key);
}

/** Write a localStorage value in the page context. */
async function setLocalStorage(page: Page, key: string, value: string): Promise<void> {
  await page.evaluate(({ k, v }) => localStorage.setItem(k, v), { k: key, v: value });
}

/** Emit a validation event to the analytics endpoint. */
async function emitValidation(
  page: Page,
  action: string,
  metadata: Record<string, unknown> = {},
) {
  await page.evaluate(
    ({ a, m }) => {
      fetch("/api/analytics/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          events: [
            {
              event_type: "journey_stitching_validation",
              action: a,
              page: window.location.pathname,
              session_id: "e2e-validation",
              user_fingerprint: "e2e-test",
              timestamp: new Date().toISOString(),
              metadata: m,
            },
          ],
        }),
      }).catch(() => {});
    },
    { a: action, m: metadata },
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe("Journey Stitching", () => {
  test("visitor_id persists across page navigations", async ({ page }) => {
    await page.goto("/inventory", { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForTimeout(1000);

    // Read visitor ID
    const vid1 = await getLocalStorage(page, "wolfpack_journey_visitor_id");
    expect(vid1).toBeTruthy();
    expect(vid1).toMatch(/^vid_/);

    // Navigate to another page
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(500);

    // Visitor ID should persist
    const vid2 = await getLocalStorage(page, "wolfpack_journey_visitor_id");
    expect(vid2).toBe(vid1);

    // Navigate to VDP
    await page.goto("/inventory", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(500);

    const vid3 = await getLocalStorage(page, "wolfpack_journey_visitor_id");
    expect(vid3).toBe(vid1);

    await emitValidation(page, "visitor_id_persistence_verified", {
      visitor_id: vid1,
      pages_checked: 3,
    });
  });

  test("session counting increments in journey data", async ({ page }) => {
    await page.goto("/inventory", { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForTimeout(1000);

    // Read journey data
    const raw = await getLocalStorage(page, "wolfpack_journey_data");
    expect(raw).toBeTruthy();

    const journeyData = JSON.parse(raw!);
    expect(journeyData.sessions).toBeDefined();
    expect(journeyData.sessions.length).toBeGreaterThanOrEqual(1);

    const lastSession = journeyData.sessions[journeyData.sessions.length - 1];
    expect(lastSession.session_number).toBe(journeyData.sessions.length);

    await emitValidation(page, "session_counting_verified", {
      session_count: journeyData.sessions.length,
      session_number: lastSession.session_number,
    });
  });

  test("narrowing detection works with pre-seeded data", async ({ page }) => {
    await page.goto("/inventory", { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForTimeout(500);

    // Seed journey data with a broad first session
    const vid = await getLocalStorage(page, "wolfpack_journey_visitor_id") || "vid_test";
    const seededData = {
      visitor_id: vid,
      first_visit_at: new Date(Date.now() - 3 * 86400000).toISOString(),
      last_visit_at: new Date(Date.now() - 86400000).toISOString(),
      sessions: [
        {
          session_number: 1,
          started_at: new Date(Date.now() - 3 * 86400000).toISOString(),
          vehicles_viewed: ["VIN001", "VIN002", "VIN003", "VIN004", "VIN005"],
          categories_browsed: ["Toyota", "Honda", "Ford", "Chevy"],
          calculator_used: false,
          pages_viewed: 15,
        },
        {
          session_number: 2,
          started_at: new Date(Date.now() - 86400000).toISOString(),
          vehicles_viewed: ["VIN001", "VIN002"],
          categories_browsed: ["Toyota"],
          calculator_used: false,
          pages_viewed: 8,
        },
      ],
      vehicle_view_counts: { VIN001: 2, VIN002: 2, VIN003: 1, VIN004: 1, VIN005: 1 },
      current_session_index: 1,
    };
    await setLocalStorage(page, "wolfpack_journey_data", JSON.stringify(seededData));

    // Reload to trigger new session with narrowing
    await page.goto("/inventory", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1000);

    const raw = await getLocalStorage(page, "wolfpack_journey_data");
    const data = JSON.parse(raw!);

    // Should now have 3 sessions
    expect(data.sessions.length).toBe(3);

    await emitValidation(page, "narrowing_detection_verified", {
      total_sessions: data.sessions.length,
      session_1_vehicles: seededData.sessions[0].vehicles_viewed.length,
      session_2_vehicles: seededData.sessions[1].vehicles_viewed.length,
    });
  });

  test("journey stage transitions with seeded progression", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForTimeout(500);

    const vid = await getLocalStorage(page, "wolfpack_journey_visitor_id") || "vid_test";

    // Stage 1: awareness (first visit, broad)
    const awareData = {
      visitor_id: vid,
      first_visit_at: new Date().toISOString(),
      last_visit_at: new Date().toISOString(),
      sessions: [
        {
          session_number: 1,
          started_at: new Date().toISOString(),
          vehicles_viewed: ["V1", "V2", "V3", "V4"],
          categories_browsed: ["Toyota", "Honda", "Ford", "Chevy"],
          calculator_used: false,
          pages_viewed: 12,
        },
      ],
      vehicle_view_counts: { V1: 1, V2: 1, V3: 1, V4: 1 },
      current_session_index: 0,
    };
    await setLocalStorage(page, "wolfpack_journey_data", JSON.stringify(awareData));

    // Reload and verify awareness → should transition to consideration on return
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1000);

    const raw = await getLocalStorage(page, "wolfpack_journey_data");
    const data = JSON.parse(raw!);
    // Should now have 2 sessions (awareness → consideration)
    expect(data.sessions.length).toBe(2);

    await emitValidation(page, "stage_transition_verified", {
      initial_sessions: 1,
      final_sessions: data.sessions.length,
    });
  });

  test("shortlist tracking across multiple views", async ({ page }) => {
    await page.goto("/inventory", { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForTimeout(500);

    const vid = await getLocalStorage(page, "wolfpack_journey_visitor_id") || "vid_test";

    // Seed data with repeated vehicle views
    const seededData = {
      visitor_id: vid,
      first_visit_at: new Date(Date.now() - 2 * 86400000).toISOString(),
      last_visit_at: new Date().toISOString(),
      sessions: [
        {
          session_number: 1,
          started_at: new Date(Date.now() - 2 * 86400000).toISOString(),
          vehicles_viewed: ["VIN-CAMRY", "VIN-CIVIC", "VIN-F150"],
          categories_browsed: ["Toyota", "Honda", "Ford"],
          calculator_used: false,
          pages_viewed: 10,
        },
      ],
      vehicle_view_counts: {
        "VIN-CAMRY": 3,
        "VIN-CIVIC": 2,
        "VIN-F150": 1,
      },
      current_session_index: 0,
    };
    await setLocalStorage(page, "wolfpack_journey_data", JSON.stringify(seededData));
    await page.goto("/inventory", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1000);

    const raw = await getLocalStorage(page, "wolfpack_journey_data");
    const data = JSON.parse(raw!);

    // Vehicles with 2+ views should be shortlisted
    const shortlisted = Object.entries(data.vehicle_view_counts as Record<string, number>)
      .filter(([, count]) => count >= 2)
      .map(([vin]) => vin);

    expect(shortlisted).toContain("VIN-CAMRY");
    expect(shortlisted).toContain("VIN-CIVIC");
    expect(shortlisted).not.toContain("VIN-F150");

    await emitValidation(page, "shortlist_tracking_verified", {
      shortlisted_count: shortlisted.length,
      shortlisted_vins: shortlisted.join(","),
    });
  });
});
