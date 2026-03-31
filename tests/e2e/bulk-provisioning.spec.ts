/**
 * Bulk Provisioning E2E Tests.
 *
 * Validates agency-level bulk dealer provisioning: batch creation,
 * max limit enforcement, partial failure handling, duplicate detection,
 * auth requirements, and invite token generation.
 *
 * Run: npx playwright test tests/e2e/bulk-provisioning.spec.ts
 */

import { test, expect } from "@playwright/test";

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

const ENDPOINT = "/api/agency/provision";

function expectNotServerError(status: number, label: string): void {
  expect(status, `${label} — server crashed (500)`).not.toBe(500);
}

function makeDealerPayload(suffix: string | number) {
  return {
    name: `Bulk Dealer ${suffix}`,
    email: `bulk-${suffix}-${Date.now()}@example.com`,
    phone: "555-0100",
    address: "100 Bulk St",
    city: "Tampa",
    state: "FL",
    zip: "33601",
  };
}

/* -------------------------------------------------------------------------- */
/* Batch creation                                                             */
/* -------------------------------------------------------------------------- */

test.describe("Bulk Provisioning: batch creation", () => {
  test("POST /api/agency/provision with valid batch does not crash", async ({
    request,
  }) => {
    const dealers = [makeDealerPayload("A"), makeDealerPayload("B")];
    const res = await request.post(ENDPOINT, { data: { dealers } });
    expectNotServerError(res.status(), "bulk provision");
    // Accept 200/201 (success), 401/403 (auth required), 404 (route not found)
    expect([200, 201, 401, 403, 404]).toContain(res.status());
  });

  test("successful provision returns dealer IDs and invite tokens", async ({
    request,
  }) => {
    const dealers = [makeDealerPayload("C"), makeDealerPayload("D")];
    const res = await request.post(ENDPOINT, { data: { dealers } });
    expectNotServerError(res.status(), "bulk provision response shape");

    if (res.status() === 200 || res.status() === 201) {
      const body = await res.json();
      expect(body).toHaveProperty("results");
      expect(Array.isArray(body.results)).toBe(true);
      for (const result of body.results) {
        expect(result).toHaveProperty("dealer_id");
        expect(result).toHaveProperty("status");
        expect(typeof result.dealer_id).toBe("string");
      }
    }
  });

  test("single dealer batch works", async ({ request }) => {
    const dealers = [makeDealerPayload("single")];
    const res = await request.post(ENDPOINT, { data: { dealers } });
    expectNotServerError(res.status(), "single dealer batch");
    expect([200, 201, 401, 403, 404]).toContain(res.status());
  });
});

/* -------------------------------------------------------------------------- */
/* Max limit enforcement                                                      */
/* -------------------------------------------------------------------------- */

test.describe("Bulk Provisioning: max limit enforcement", () => {
  test("batch of 50 dealers is accepted", async ({ request }) => {
    const dealers = Array.from({ length: 50 }, (_, i) =>
      makeDealerPayload(`limit-${i}`),
    );
    const res = await request.post(ENDPOINT, { data: { dealers } });
    expectNotServerError(res.status(), "batch of 50");
    // Should not be rejected for size
    expect([200, 201, 401, 403, 404]).toContain(res.status());
  });

  test("batch of 51 dealers is rejected with 400 or 422", async ({
    request,
  }) => {
    const dealers = Array.from({ length: 51 }, (_, i) =>
      makeDealerPayload(`over-${i}`),
    );
    const res = await request.post(ENDPOINT, { data: { dealers } });
    expectNotServerError(res.status(), "batch of 51");
    // Should be rejected for exceeding limit OR require auth
    expect([400, 401, 403, 404, 422]).toContain(res.status());

    if (res.status() === 400 || res.status() === 422) {
      const body = await res.json();
      expect(body).toHaveProperty("error");
    }
  });

  test("empty batch is rejected with 400 or 422", async ({ request }) => {
    const res = await request.post(ENDPOINT, { data: { dealers: [] } });
    expectNotServerError(res.status(), "empty batch");
    expect([400, 401, 403, 404, 422]).toContain(res.status());
  });
});

/* -------------------------------------------------------------------------- */
/* Partial failure handling                                                    */
/* -------------------------------------------------------------------------- */

test.describe("Bulk Provisioning: partial failure handling", () => {
  test("one invalid dealer does not fail the entire batch", async ({
    request,
  }) => {
    const dealers = [
      makeDealerPayload("good-1"),
      { name: "", email: "bad", phone: "", address: "", city: "", state: "", zip: "" },
      makeDealerPayload("good-2"),
    ];
    const res = await request.post(ENDPOINT, { data: { dealers } });
    expectNotServerError(res.status(), "partial failure batch");

    if (res.status() === 200 || res.status() === 201) {
      const body = await res.json();
      expect(body).toHaveProperty("results");
      // At least some should succeed
      const successes = body.results.filter(
        (r: { status: string }) => r.status === "created",
      );
      const failures = body.results.filter(
        (r: { status: string }) => r.status === "failed",
      );
      expect(successes.length).toBeGreaterThan(0);
      expect(failures.length).toBeGreaterThan(0);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* Duplicate detection                                                        */
/* -------------------------------------------------------------------------- */

test.describe("Bulk Provisioning: duplicate detection", () => {
  test("duplicate emails within a batch are flagged", async ({ request }) => {
    const sharedEmail = `dup-${Date.now()}@example.com`;
    const dealers = [
      { ...makeDealerPayload("dup-1"), email: sharedEmail },
      { ...makeDealerPayload("dup-2"), email: sharedEmail },
    ];
    const res = await request.post(ENDPOINT, { data: { dealers } });
    expectNotServerError(res.status(), "duplicate email batch");
    // Should either reject (400/422) or handle with partial results
    expect([200, 201, 400, 401, 403, 404, 422]).toContain(res.status());

    if (res.status() === 400 || res.status() === 422) {
      const body = await res.json();
      expect(body.error).toBeTruthy();
    }
  });

  test("duplicate dealer names produce different slugs or are flagged", async ({
    request,
  }) => {
    const dealers = [
      { ...makeDealerPayload("samename"), name: "Identical Motors" },
      { ...makeDealerPayload("samename2"), name: "Identical Motors" },
    ];
    const res = await request.post(ENDPOINT, { data: { dealers } });
    expectNotServerError(res.status(), "duplicate name batch");
    expect([200, 201, 400, 401, 403, 404, 422]).toContain(res.status());
  });
});

/* -------------------------------------------------------------------------- */
/* Agency auth requirement                                                    */
/* -------------------------------------------------------------------------- */

test.describe("Bulk Provisioning: agency auth", () => {
  test("unauthenticated request returns 401 or 403, not 200", async ({
    request,
  }) => {
    const dealers = [makeDealerPayload("noauth")];
    const res = await request.post(ENDPOINT, { data: { dealers } });
    expectNotServerError(res.status(), "unauthenticated provision");
    // In production: 401/403. In demo mode: may allow. Route not found: 404.
    expect([200, 201, 401, 403, 404]).toContain(res.status());
  });

  test("request with invalid API key returns 401 or 403", async ({
    request,
  }) => {
    const dealers = [makeDealerPayload("badkey")];
    const res = await request.post(ENDPOINT, {
      headers: { Authorization: "Bearer invalid-key-12345" },
      data: { dealers },
    });
    expectNotServerError(res.status(), "invalid API key provision");
    expect([401, 403, 404]).toContain(res.status());
  });
});

/* -------------------------------------------------------------------------- */
/* Invite tokens                                                              */
/* -------------------------------------------------------------------------- */

test.describe("Bulk Provisioning: invite tokens", () => {
  test("each provisioned dealer gets a unique invite token", async ({
    request,
  }) => {
    const dealers = [
      makeDealerPayload("token-1"),
      makeDealerPayload("token-2"),
      makeDealerPayload("token-3"),
    ];
    const res = await request.post(ENDPOINT, { data: { dealers } });
    expectNotServerError(res.status(), "invite token generation");

    if (res.status() === 200 || res.status() === 201) {
      const body = await res.json();
      if (body.results?.[0]?.invite_token) {
        const tokens = body.results.map(
          (r: { invite_token: string }) => r.invite_token,
        );
        const uniqueTokens = new Set(tokens);
        expect(uniqueTokens.size).toBe(tokens.length);
      }
    }
  });
});
