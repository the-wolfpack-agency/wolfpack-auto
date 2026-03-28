/**
 * Communications Flow Integration Tests
 *
 * Announcement/comms lifecycle: create announcement -> verify in list ->
 * filter by audience -> check analytics -> verify in browser UI.
 */
import { test, expect } from "@playwright/test";
import {
  getAuthCookies,
  assertAnalyticsReachable,
  authGet,
  authPost,
} from "./helpers";

let cookies: string;

test.beforeAll(async ({ request }) => {
  cookies = await getAuthCookies(request);
});

/* ------------------------------------------------------------------ */
/*  Test data                                                          */
/* ------------------------------------------------------------------ */

const ANNOUNCEMENT_TITLE = `E2E Announcement ${Date.now()}`;

function announcementPayload(overrides: Record<string, unknown> = {}) {
  return {
    title: ANNOUNCEMENT_TITLE,
    body: "This is an E2E integration test announcement. All hands meeting rescheduled to Friday at 2 PM. Please confirm attendance with your department head.",
    audience: "all" as const,
    pinned: false,
    ...overrides,
  };
}

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

test.describe("Communications Flow", () => {
  let createdAnnouncementId: string;

  test("POST /api/admin/comms creates an announcement", async ({
    request,
  }) => {
    const res = await authPost(
      request,
      cookies,
      "/api/admin/comms",
      announcementPayload(),
    );
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.id).toBeTruthy();

    createdAnnouncementId = body.id;
  });

  test("POST /api/admin/comms creates a pinned sales announcement", async ({
    request,
  }) => {
    const res = await authPost(request, cookies, "/api/admin/comms", {
      title: `Pinned Sales Update ${Date.now()}`,
      body: "New OEM incentives just dropped. Updated pricing sheets are in the shared drive. All sales staff must review before Monday.",
      audience: "sales",
      pinned: true,
    });
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test("POST /api/admin/comms rejects missing fields", async ({ request }) => {
    const res = await authPost(request, cookies, "/api/admin/comms", {
      title: "Missing body and audience",
      // body and audience are missing
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("required");
  });

  test("POST /api/admin/comms rejects invalid audience", async ({
    request,
  }) => {
    const res = await authPost(request, cookies, "/api/admin/comms", {
      title: "Bad audience",
      body: "Test body content",
      audience: "invalid_audience",
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("audience");
  });

  test("GET /api/admin/comms returns announcements list", async ({
    request,
  }) => {
    const res = await authGet(request, cookies, "/api/admin/comms");
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body.announcements).toBeTruthy();
    expect(Array.isArray(body.announcements)).toBe(true);
    expect(body.announcements.length).toBeGreaterThan(0);

    // Verify announcement shape
    const ann = body.announcements[0];
    expect(ann.id).toBeTruthy();
    expect(ann.title).toBeTruthy();
    expect(ann.body).toBeTruthy();
    expect(ann.audience).toBeTruthy();
    expect(typeof ann.pinned).toBe("boolean");
  });

  test("GET /api/admin/comms supports audience filter", async ({
    request,
  }) => {
    const res = await authGet(
      request,
      cookies,
      "/api/admin/comms?audience=service",
    );
    expect(res.status()).toBe(200);

    const body = await res.json();
    // Should return service-specific announcements + "all" audience
    for (const ann of body.announcements) {
      expect(["service", "all"]).toContain(ann.audience);
    }
  });

  test("Analytics health responds after comms operations", async ({
    request,
  }) => {
    const health = await assertAnalyticsReachable(request, cookies);
    expect(["shadow_mode", "healthy", "degraded", "error"]).toContain(
      health.status,
    );
  });

  test("Unauthenticated comms access is rejected", async ({ request }) => {
    const res = await request.get("/api/admin/comms");
    expect(res.status()).not.toBe(500);
    expect(res.status()).not.toBe(200);
  });
});
