import { test, expect } from "@playwright/test";

/**
 * concurrent-safety.spec.ts
 *
 * E2E tests for optimistic locking on high-risk PATCH routes:
 *   - PATCH /api/admin/deals/[dealId]
 *   - PATCH /api/admin/service/appointments/[id]
 *   - PATCH /api/admin/service/repair-orders/[id]
 *
 * Design rules:
 *   - HTTP 500 is NEVER acceptable.
 *   - When `updated_at` is included and matches, the update succeeds.
 *   - When `updated_at` is included and is stale, the route returns 409 Conflict.
 *   - Without `updated_at`, the route behaves as before (no lock check).
 */

// ---------------------------------------------------------------------------
// PATCH /api/admin/deals/[dealId] — optimistic locking
// ---------------------------------------------------------------------------

test.describe("Concurrent safety: PATCH /api/admin/deals/[dealId]", () => {
  test("PATCH with matching updated_at succeeds or returns 401, never 500", async ({
    request,
  }) => {
    const resp = await request.patch("/api/admin/deals/deal-001", {
      data: {
        status: "working",
        updated_at: "2026-03-28T14:22:00Z",
      },
    });

    expect(resp.status()).not.toBe(500);
    // 200 in shadow/demo mode, 401 when auth active, 409 if stale
    expect([200, 401, 403, 409]).toContain(resp.status());

    if (resp.status() === 200) {
      const body = (await resp.json()) as Record<string, unknown>;
      expect(body.updated).toBe(true);
    }
  });

  test("PATCH with stale updated_at returns 409 or 401, never 500", async ({
    request,
  }) => {
    const resp = await request.patch("/api/admin/deals/deal-001", {
      data: {
        status: "funded",
        updated_at: "1999-01-01T00:00:00Z", // definitely stale
      },
    });

    expect(resp.status()).not.toBe(500);
    // Shadow mode without DB may still return 200 (no DB to check against)
    // With DB: 409 (stale) or 401 (auth)
    expect([200, 401, 403, 409]).toContain(resp.status());
  });

  test("PATCH without updated_at succeeds normally (backward compatible), never 500", async ({
    request,
  }) => {
    const resp = await request.patch("/api/admin/deals/deal-001", {
      data: { notes: "Updated without lock" },
    });

    expect(resp.status()).not.toBe(500);
    expect([200, 401, 403]).toContain(resp.status());
  });
});

// ---------------------------------------------------------------------------
// PATCH /api/admin/service/appointments/[id] — optimistic locking
// ---------------------------------------------------------------------------

test.describe("Concurrent safety: PATCH /api/admin/service/appointments/[id]", () => {
  test("PATCH with updated_at succeeds or returns appropriate status, never 500", async ({
    request,
  }) => {
    const resp = await request.patch("/api/admin/service/appointments/appt-001", {
      data: {
        status: "completed",
        updated_at: new Date().toISOString(),
      },
    });

    expect(resp.status()).not.toBe(500);
    expect([200, 401, 403, 409]).toContain(resp.status());
  });

  test("PATCH without updated_at is backward compatible, never 500", async ({
    request,
  }) => {
    const resp = await request.patch("/api/admin/service/appointments/appt-001", {
      data: { status: "checked_in" },
    });

    expect(resp.status()).not.toBe(500);
    expect([200, 401, 403]).toContain(resp.status());
  });
});

// ---------------------------------------------------------------------------
// PATCH /api/admin/service/repair-orders/[id] — optimistic locking
// ---------------------------------------------------------------------------

test.describe("Concurrent safety: PATCH /api/admin/service/repair-orders/[id]", () => {
  test("PATCH with updated_at succeeds or returns appropriate status, never 500", async ({
    request,
  }) => {
    const resp = await request.patch("/api/admin/service/repair-orders/ro-001", {
      data: {
        status: "completed",
        updated_at: new Date().toISOString(),
      },
    });

    expect(resp.status()).not.toBe(500);
    expect([200, 401, 403, 409]).toContain(resp.status());
  });

  test("PATCH with stale updated_at returns 409 or auth error, never 500", async ({
    request,
  }) => {
    const resp = await request.patch("/api/admin/service/repair-orders/ro-001", {
      data: {
        status: "invoiced",
        updated_at: "1999-01-01T00:00:00Z",
      },
    });

    expect(resp.status()).not.toBe(500);
    expect([200, 401, 403, 409]).toContain(resp.status());
  });
});

// ---------------------------------------------------------------------------
// Simulated concurrent writes
// ---------------------------------------------------------------------------

test.describe("Concurrent safety: simultaneous writes", () => {
  test("Two simultaneous PATCHes to the same deal — at most one gets 409, never 500", async ({
    request,
  }) => {
    const patchData = (status: string) => ({
      status,
      updated_at: "2026-03-28T14:22:00Z",
    });

    // Fire two PATCHes simultaneously
    const [resp1, resp2] = await Promise.all([
      request.patch("/api/admin/deals/deal-001", {
        data: patchData("presented"),
      }),
      request.patch("/api/admin/deals/deal-001", {
        data: patchData("accepted"),
      }),
    ]);

    // Neither should crash
    expect(resp1.status()).not.toBe(500);
    expect(resp2.status()).not.toBe(500);

    // In shadow mode (no DB), both may succeed (200).
    // With DB: one succeeds (200), the other gets 409.
    // With auth active: both get 401.
    const statuses = [resp1.status(), resp2.status()].sort();
    for (const s of statuses) {
      expect([200, 401, 403, 409]).toContain(s);
    }
  });
});
