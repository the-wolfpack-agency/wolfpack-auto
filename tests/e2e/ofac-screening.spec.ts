/**
 * OFAC Screening — Comprehensive E2E Tests
 *
 * Tests the OFAC SDN compliance screening feature end-to-end:
 *   - API routes: GET/POST /api/admin/ofac, GET/PATCH /api/admin/ofac/[id]
 *   - Screening engine: SDN matching, scoring, reference IDs, DOB masking
 *   - Page rendering: heading, compliance banner, stats, table, buttons
 *
 * Every assert uses explicit 200/201/422 checks — never "not 500".
 */

import { test, expect } from "@playwright/test";

/* ========================================================================== */
/* API Tests — GET /api/admin/ofac                                            */
/* ========================================================================== */

test.describe("GET /api/admin/ofac — list screenings", () => {
  test("returns 200 with screenings array", async ({ request }) => {
    const resp = await request.get("/api/admin/ofac");
    expect(resp.status()).toBe(200);

    const data = await resp.json();
    expect(data).toHaveProperty("screenings");
    expect(Array.isArray(data.screenings)).toBe(true);
    expect(data).toHaveProperty("total");
    expect(typeof data.total).toBe("number");
  });

  test("screenings have correct structure", async ({ request }) => {
    const resp = await request.get("/api/admin/ofac");
    expect(resp.status()).toBe(200);

    const data = await resp.json();
    expect(data.screenings.length).toBeGreaterThan(0);

    const screening = data.screenings[0];
    expect(screening).toHaveProperty("id");
    expect(screening).toHaveProperty("customer_name");
    expect(screening).toHaveProperty("status");
    expect(screening).toHaveProperty("match_score");
    expect(screening).toHaveProperty("reference_id");
    expect(screening).toHaveProperty("screened_at");
    expect(screening).toHaveProperty("dealer_id");
    expect(screening).toHaveProperty("matches_found");
    expect(typeof screening.match_score).toBe("number");
    expect(typeof screening.customer_name).toBe("string");
  });

  test("status filter returns only matching screenings", async ({
    request,
  }) => {
    const resp = await request.get("/api/admin/ofac?status=clear");
    expect(resp.status()).toBe(200);

    const data = await resp.json();
    for (const s of data.screenings) {
      expect(s.status).toBe("clear");
    }
  });

  test("status filter for potential_match works", async ({ request }) => {
    const resp = await request.get("/api/admin/ofac?status=potential_match");
    expect(resp.status()).toBe(200);

    const data = await resp.json();
    expect(data.screenings.length).toBeGreaterThan(0);
    for (const s of data.screenings) {
      expect(s.status).toBe("potential_match");
    }
  });

  test("total count matches screenings array length", async ({ request }) => {
    const resp = await request.get("/api/admin/ofac");
    expect(resp.status()).toBe(200);

    const data = await resp.json();
    expect(data.total).toBe(data.screenings.length);
  });
});

/* ========================================================================== */
/* API Tests — POST /api/admin/ofac                                           */
/* ========================================================================== */

test.describe("POST /api/admin/ofac — screen customer", () => {
  test("screens customer and returns 201", async ({ request }) => {
    const resp = await request.post("/api/admin/ofac", {
      data: { customer_name: "Jane Doe" },
    });
    expect(resp.status()).toBe(201);

    const data = await resp.json();
    expect(data).toHaveProperty("screening");
    expect(data).toHaveProperty("result");
    expect(data).toHaveProperty("created", true);
  });

  test("clear name returns status clear with score 0", async ({ request }) => {
    const resp = await request.post("/api/admin/ofac", {
      data: { customer_name: "John Smith" },
    });
    expect(resp.status()).toBe(201);

    const data = await resp.json();
    expect(data.result.status).toBe("clear");
    expect(data.result.match_score).toBe(0);
    expect(data.result.matches).toEqual([]);
  });

  test("SDN test name returns potential_match", async ({ request }) => {
    const resp = await request.post("/api/admin/ofac", {
      data: { customer_name: "Ahmed Bilal" },
    });
    expect(resp.status()).toBe(201);

    const data = await resp.json();
    // "Ahmed Bilal" closely matches SDN entry "AHMED, Bilal"
    expect(["potential_match", "confirmed_match"]).toContain(data.result.status);
    expect(data.result.match_score).toBeGreaterThan(0);
    expect(data.result.matches.length).toBeGreaterThan(0);
  });

  test("missing customer_name returns 422", async ({ request }) => {
    const resp = await request.post("/api/admin/ofac", {
      data: {},
    });
    expect(resp.status()).toBe(422);

    const data = await resp.json();
    expect(data.error).toContain("customer_name");
  });

  test("empty customer_name string returns 422", async ({ request }) => {
    const resp = await request.post("/api/admin/ofac", {
      data: { customer_name: "   " },
    });
    expect(resp.status()).toBe(422);
  });

  test("screening result includes reference_id", async ({ request }) => {
    const resp = await request.post("/api/admin/ofac", {
      data: { customer_name: "Test Customer" },
    });
    expect(resp.status()).toBe(201);

    const data = await resp.json();
    expect(data.result).toHaveProperty("reference_id");
    expect(typeof data.result.reference_id).toBe("string");
    expect(data.result.reference_id).toMatch(/^OFAC-/);
  });

  test("DOB is masked in response — month/year only", async ({ request }) => {
    const resp = await request.post("/api/admin/ofac", {
      data: {
        customer_name: "Jane Test",
        customer_dob: "1990-05-15",
      },
    });
    expect(resp.status()).toBe(201);

    const data = await resp.json();
    const masked = data.screening.customer_dob_masked;
    expect(masked).toBe("05/1990");
    // Must NOT contain full date
    expect(masked).not.toContain("15");
    expect(masked).not.toContain("1990-05-15");
  });

  test("screening with deal_id attaches it to the record", async ({
    request,
  }) => {
    const resp = await request.post("/api/admin/ofac", {
      data: {
        customer_name: "Deal Test Customer",
        deal_id: "deal-test-123",
      },
    });
    expect(resp.status()).toBe(201);

    const data = await resp.json();
    expect(data.screening.deal_id).toBe("deal-test-123");
  });
});

/* ========================================================================== */
/* API Tests — GET /api/admin/ofac/[screeningId]                              */
/* ========================================================================== */

test.describe("GET /api/admin/ofac/[screeningId] — single screening", () => {
  test("returns 200 with screening detail for known ID", async ({
    request,
  }) => {
    const resp = await request.get("/api/admin/ofac/ofac-006");
    expect(resp.status()).toBe(200);

    const data = await resp.json();
    expect(data).toHaveProperty("screening");
    expect(data.screening.id).toBe("ofac-006");
    expect(data.screening.customer_name).toBe("Ahmed Bilal");
    expect(data.screening.status).toBe("potential_match");
    expect(data.screening.match_score).toBe(72);
  });

  test("screening detail includes matches_detail array", async ({
    request,
  }) => {
    const resp = await request.get("/api/admin/ofac/ofac-006");
    expect(resp.status()).toBe(200);

    const data = await resp.json();
    expect(data.screening.matches_detail).toBeDefined();
    expect(Array.isArray(data.screening.matches_detail)).toBe(true);
    expect(data.screening.matches_detail.length).toBeGreaterThan(0);

    const match = data.screening.matches_detail[0];
    expect(match).toHaveProperty("name");
    expect(match).toHaveProperty("type");
    expect(match).toHaveProperty("program");
    expect(match).toHaveProperty("score");
  });

  test("screening detail includes audit_log", async ({ request }) => {
    const resp = await request.get("/api/admin/ofac/ofac-006");
    expect(resp.status()).toBe(200);

    const data = await resp.json();
    expect(data.screening.audit_log).toBeDefined();
    expect(Array.isArray(data.screening.audit_log)).toBe(true);
    expect(data.screening.audit_log.length).toBeGreaterThan(0);
  });

  test("unknown screening ID still returns 200 with fallback", async ({
    request,
  }) => {
    const resp = await request.get("/api/admin/ofac/ofac-nonexistent");
    expect(resp.status()).toBe(200);

    const data = await resp.json();
    expect(data.screening).toBeDefined();
    expect(data.screening.id).toBe("ofac-nonexistent");
    expect(data.screening.status).toBe("clear");
  });

  test("DOB is masked in detail response", async ({ request }) => {
    const resp = await request.get("/api/admin/ofac/ofac-006");
    expect(resp.status()).toBe(200);

    const data = await resp.json();
    // Mock has customer_dob_masked: "03/1985" (month/year only)
    if (data.screening.customer_dob_masked) {
      expect(data.screening.customer_dob_masked).toMatch(/^\d{2}\/\d{4}$/);
    }
  });
});

/* ========================================================================== */
/* API Tests — PATCH /api/admin/ofac/[screeningId]                            */
/* ========================================================================== */

test.describe("PATCH /api/admin/ofac/[screeningId] — override", () => {
  test("override with reason returns 200", async ({ request }) => {
    const resp = await request.patch("/api/admin/ofac/ofac-006", {
      data: {
        action: "override",
        override_reason:
          "Verified customer identity via government-issued ID; no relation to SDN entry",
      },
    });
    expect(resp.status()).toBe(200);

    const data = await resp.json();
    expect(data).toHaveProperty("screening");
    expect(data).toHaveProperty("updated", true);
    expect(data.screening.status).toBe("override");
    expect(data.screening.override_reason).toBeTruthy();
    expect(data.screening.reviewed_by).toBeTruthy();
    expect(data.screening.reviewed_at).toBeTruthy();
  });

  test("override without reason returns 422", async ({ request }) => {
    const resp = await request.patch("/api/admin/ofac/ofac-006", {
      data: { action: "override" },
    });
    expect(resp.status()).toBe(422);

    const data = await resp.json();
    expect(data.error).toContain("override_reason");
  });

  test("override with empty reason string returns 422", async ({
    request,
  }) => {
    const resp = await request.patch("/api/admin/ofac/ofac-006", {
      data: { action: "override", override_reason: "   " },
    });
    expect(resp.status()).toBe(422);
  });

  test("escalate action returns 200", async ({ request }) => {
    const resp = await request.patch("/api/admin/ofac/ofac-006", {
      data: { action: "escalate" },
    });
    expect(resp.status()).toBe(200);

    const data = await resp.json();
    expect(data.screening.status).toBe("potential_match");
    expect(data.updated).toBe(true);
  });

  test("block action returns 200 with confirmed_match status", async ({
    request,
  }) => {
    const resp = await request.patch("/api/admin/ofac/ofac-006", {
      data: { action: "block" },
    });
    expect(resp.status()).toBe(200);

    const data = await resp.json();
    expect(data.screening.status).toBe("confirmed_match");
    expect(data.updated).toBe(true);
  });

  test("invalid action returns 422", async ({ request }) => {
    const resp = await request.patch("/api/admin/ofac/ofac-006", {
      data: { action: "invalid_action" },
    });
    expect(resp.status()).toBe(422);

    const data = await resp.json();
    expect(data.error).toContain("action");
  });
});

/* ========================================================================== */
/* Screening Engine Tests (via API)                                           */
/* ========================================================================== */

test.describe("Screening engine — SDN matching via API", () => {
  test("clean name 'John Smith' returns clear", async ({ request }) => {
    const resp = await request.post("/api/admin/ofac", {
      data: { customer_name: "John Smith" },
    });
    expect(resp.status()).toBe(201);

    const data = await resp.json();
    expect(data.result.status).toBe("clear");
    expect(data.result.match_score).toBe(0);
  });

  test("name similar to SDN entry returns potential_match with score > 0", async ({
    request,
  }) => {
    // "Ahmed Bilal" closely matches SDN entry "AHMED, Bilal" (same tokens, near-identical string)
    const resp = await request.post("/api/admin/ofac", {
      data: { customer_name: "Ahmed Bilal" },
    });
    expect(resp.status()).toBe(201);

    const data = await resp.json();
    expect(data.result.match_score).toBeGreaterThan(0);
    expect(data.result.matches.length).toBeGreaterThan(0);
  });

  test("exact SDN match returns high score (>= 80)", async ({ request }) => {
    // Exact match against "AHMED, Bilal" SDN entry
    const resp = await request.post("/api/admin/ofac", {
      data: { customer_name: "AHMED, Bilal" },
    });
    expect(resp.status()).toBe(201);

    const data = await resp.json();
    expect(data.result.match_score).toBeGreaterThanOrEqual(80);
  });

  test("screening always returns screened_at timestamp", async ({
    request,
  }) => {
    const resp = await request.post("/api/admin/ofac", {
      data: { customer_name: "Timestamp Test" },
    });
    expect(resp.status()).toBe(201);

    const data = await resp.json();
    expect(data.result).toHaveProperty("screened_at");
    expect(typeof data.result.screened_at).toBe("string");

    // Validate ISO date format
    const date = new Date(data.result.screened_at);
    expect(date.getTime()).not.toBeNaN();
  });

  test("every screening generates a unique reference_id", async ({
    request,
  }) => {
    const resp1 = await request.post("/api/admin/ofac", {
      data: { customer_name: "Unique Test One" },
    });
    const resp2 = await request.post("/api/admin/ofac", {
      data: { customer_name: "Unique Test Two" },
    });
    expect(resp1.status()).toBe(201);
    expect(resp2.status()).toBe(201);

    const data1 = await resp1.json();
    const data2 = await resp2.json();

    expect(data1.result.reference_id).not.toBe(data2.result.reference_id);
    expect(data1.result.reference_id).toMatch(/^OFAC-/);
    expect(data2.result.reference_id).toMatch(/^OFAC-/);
  });

  test("entity name match works (SBERBANK OF RUSSIA)", async ({ request }) => {
    const resp = await request.post("/api/admin/ofac", {
      data: { customer_name: "SBERBANK OF RUSSIA" },
    });
    expect(resp.status()).toBe(201);

    const data = await resp.json();
    expect(data.result.match_score).toBeGreaterThanOrEqual(80);
    expect(data.result.matches.length).toBeGreaterThan(0);
    expect(data.result.matches[0].type).toBe("entity");
  });

  test("DOB masking: 1990-05-15 becomes 05/1990", async ({ request }) => {
    const resp = await request.post("/api/admin/ofac", {
      data: {
        customer_name: "Mask Test",
        customer_dob: "1990-05-15",
      },
    });
    expect(resp.status()).toBe(201);

    const data = await resp.json();
    expect(data.screening.customer_dob_masked).toBe("05/1990");
  });

  test("DOB masking: 1985-12-01 becomes 12/1985", async ({ request }) => {
    const resp = await request.post("/api/admin/ofac", {
      data: {
        customer_name: "Mask Test Two",
        customer_dob: "1985-12-01",
      },
    });
    expect(resp.status()).toBe(201);

    const data = await resp.json();
    expect(data.screening.customer_dob_masked).toBe("12/1985");
  });
});

/* ========================================================================== */
/* Page Tests — /admin/ofac                                                   */
/* ========================================================================== */

test.describe("OFAC Compliance page — /admin/ofac", () => {
  test("page loads with 200 status", async ({ page }) => {
    const resp = await page.goto("/admin/ofac", {
      waitUntil: "domcontentloaded",
    });
    expect(resp?.status()).toBe(200);
  });

  test('page has "OFAC Compliance Screening" heading', async ({ page }) => {
    await page.goto("/admin/ofac", { waitUntil: "domcontentloaded" });
    const heading = page.locator("h1");
    await expect(heading).toContainText("OFAC Compliance Screening");
  });

  test("compliance banner is visible with federal law warning", async ({
    page,
  }) => {
    await page.goto("/admin/ofac", { waitUntil: "domcontentloaded" });
    const body = await page.locator("body").textContent();
    expect(body).toContain("Federal law requires OFAC screening");
  });

  test("stats cards are visible", async ({ page }) => {
    await page.goto("/admin/ofac", { waitUntil: "domcontentloaded" });

    // Wait for loading to complete
    await page.waitForSelector("text=Loading screenings...", {
      state: "hidden",
      timeout: 10000,
    }).catch(() => {});

    await expect(page.locator("text=Screenings").first()).toBeAttached();
    await expect(page.locator("text=Clear Rate")).toBeAttached();
    await expect(page.locator("text=Pending Review")).toBeAttached();
    await expect(page.locator("text=Avg Response")).toBeVisible();
  });

  test('"Screen Customer" button is visible', async ({ page }) => {
    await page.goto("/admin/ofac", { waitUntil: "domcontentloaded" });
    const button = page.locator("button", { hasText: "Screen Customer" });
    await expect(button).toBeAttached();
  });

  test("status filter dropdown is present", async ({ page }) => {
    await page.goto("/admin/ofac", { waitUntil: "domcontentloaded" });

    const select = page.locator("select").first();
    await expect(select).toBeAttached();

    // Should have status options
    await expect(select.locator("option").first()).toBeAttached();
  });

  test("screening table is present", async ({ page }) => {
    await page.goto("/admin/ofac", { waitUntil: "domcontentloaded" });

    // Wait for loading to complete
    await page.waitForSelector("text=Loading screenings...", {
      state: "hidden",
      timeout: 10000,
    }).catch(() => {});

    // Table should be present
    const table = page.locator("table");
    await expect(table).toBeVisible();
  });
});
