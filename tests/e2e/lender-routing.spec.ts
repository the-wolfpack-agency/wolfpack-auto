/**
 * Lender Routing — E2E Tests
 *
 * Comprehensive tests for the lender routing feature covering:
 *   - API endpoints (GET, POST, PATCH) for submissions and lenders
 *   - Input validation (missing fields, invalid platforms)
 *   - SSN privacy (never exposed in full)
 *   - Page rendering (heading, stats, table, buttons, comparison)
 *
 * All API routes MUST return 200/201 in DEMO_MODE.
 * A non-200 means a white page for the dealer user.
 */

import { test, expect } from "@playwright/test";

/* ========================================================================== */
/* API Tests — Submissions                                                    */
/* ========================================================================== */

test.describe("Lender Routing API — Submissions", () => {
  test("GET /api/admin/lender-routing returns 200 with submissions array", async ({
    request,
  }) => {
    const resp = await request.get("/api/admin/lender-routing");
    expect(resp.status()).toBe(200);

    const data = await resp.json();
    expect(data).toHaveProperty("submissions");
    expect(Array.isArray(data.submissions)).toBe(true);
    expect(data).toHaveProperty("total");
    expect(typeof data.total).toBe("number");
    expect(data.total).toBe(data.submissions.length);
  });

  test("GET response has correct submission structure", async ({ request }) => {
    const resp = await request.get("/api/admin/lender-routing");
    expect(resp.status()).toBe(200);

    const data = await resp.json();
    expect(data.submissions.length).toBeGreaterThan(0);

    const sub = data.submissions[0];
    expect(sub).toHaveProperty("id");
    expect(sub).toHaveProperty("deal_id");
    expect(sub).toHaveProperty("customer_name");
    expect(sub).toHaveProperty("ssn_last4");
    expect(sub).toHaveProperty("platform");
    expect(sub).toHaveProperty("lender_name");
    expect(sub).toHaveProperty("lender_id");
    expect(sub).toHaveProperty("status");
    expect(sub).toHaveProperty("apr_offered");
    expect(sub).toHaveProperty("term_offered");
    expect(sub).toHaveProperty("amount_approved");
    expect(sub).toHaveProperty("stipulations");
    expect(sub).toHaveProperty("submitted_at");
    expect(sub).toHaveProperty("responded_at");
    expect(sub).toHaveProperty("expires_at");
    expect(sub).toHaveProperty("notes");
    expect(Array.isArray(sub.stipulations)).toBe(true);
  });

  test("GET with status=approved filter returns only approved submissions", async ({
    request,
  }) => {
    const resp = await request.get(
      "/api/admin/lender-routing?status=approved",
    );
    expect(resp.status()).toBe(200);

    const data = await resp.json();
    expect(data.submissions.length).toBeGreaterThan(0);
    for (const sub of data.submissions) {
      expect(sub.status).toBe("approved");
    }
  });

  test("GET with status=pending filter returns only pending submissions", async ({
    request,
  }) => {
    const resp = await request.get("/api/admin/lender-routing?status=pending");
    expect(resp.status()).toBe(200);

    const data = await resp.json();
    for (const sub of data.submissions) {
      expect(sub.status).toBe("pending");
    }
  });

  test("GET with platform=routeone filter returns only routeone submissions", async ({
    request,
  }) => {
    const resp = await request.get(
      "/api/admin/lender-routing?platform=routeone",
    );
    expect(resp.status()).toBe(200);

    const data = await resp.json();
    expect(data.submissions.length).toBeGreaterThan(0);
    for (const sub of data.submissions) {
      expect(sub.platform).toBe("routeone");
    }
  });

  test("GET with deal_id filter returns submissions for that deal", async ({
    request,
  }) => {
    const resp = await request.get(
      "/api/admin/lender-routing?deal_id=deal-001",
    );
    expect(resp.status()).toBe(200);

    const data = await resp.json();
    expect(data.submissions.length).toBeGreaterThan(0);
    for (const sub of data.submissions) {
      expect(sub.deal_id).toBe("deal-001");
    }
  });

  test("SSN is never exposed in full — only last 4 digits", async ({
    request,
  }) => {
    const resp = await request.get("/api/admin/lender-routing");
    expect(resp.status()).toBe(200);

    const data = await resp.json();
    for (const sub of data.submissions) {
      if (sub.ssn_last4 !== null) {
        expect(sub.ssn_last4.length).toBeLessThanOrEqual(4);
        // Must not look like a full SSN (XXX-XX-XXXX or 9 digits)
        expect(sub.ssn_last4).not.toMatch(/^\d{3}-?\d{2}-?\d{4}$/);
      }
    }
  });
});

/* ========================================================================== */
/* API Tests — POST Submission                                                */
/* ========================================================================== */

test.describe("Lender Routing API — POST Credit Application", () => {
  const VALID_SUBMISSION = {
    deal_id: "deal-test-001",
    customer_name: "Test Customer",
    vehicle_vin: "1HGCM82633A004352",
    selling_price: 28500,
    submission_platform: "routeone",
    selected_lenders: ["lndr-tfs", "lndr-cap1"],
  };

  test("POST /api/admin/lender-routing submits credit app and returns 201", async ({
    request,
  }) => {
    const resp = await request.post("/api/admin/lender-routing", {
      data: VALID_SUBMISSION,
    });
    expect(resp.status()).toBe(201);

    const data = await resp.json();
    expect(data).toHaveProperty("submissions");
    expect(data).toHaveProperty("created", true);
    expect(data.submissions.length).toBe(2); // Two lenders selected
    expect(data.total).toBe(2);

    // Each submission should have status "submitted"
    for (const sub of data.submissions) {
      expect(sub.status).toBe("submitted");
      expect(sub.customer_name).toBe("Test Customer");
      expect(sub.deal_id).toBe("deal-test-001");
      expect(sub.platform).toBe("routeone");
    }
  });

  test("POST with missing customer_name returns 422", async ({ request }) => {
    const resp = await request.post("/api/admin/lender-routing", {
      data: {
        deal_id: "deal-test-002",
        vehicle_vin: "1HGCM82633A004352",
        selling_price: 28500,
        submission_platform: "routeone",
        selected_lenders: ["lndr-tfs"],
      },
    });
    expect(resp.status()).toBe(422);

    const data = await resp.json();
    expect(data.error).toContain("customer_name");
  });

  test("POST with missing selected_lenders returns 422", async ({
    request,
  }) => {
    const resp = await request.post("/api/admin/lender-routing", {
      data: {
        deal_id: "deal-test-003",
        customer_name: "Test Customer",
        vehicle_vin: "1HGCM82633A004352",
        selling_price: 28500,
        submission_platform: "routeone",
      },
    });
    expect(resp.status()).toBe(422);

    const data = await resp.json();
    expect(data.error).toContain("selected_lenders");
  });

  test("POST with empty selected_lenders array returns 422", async ({
    request,
  }) => {
    const resp = await request.post("/api/admin/lender-routing", {
      data: {
        deal_id: "deal-test-004",
        customer_name: "Test Customer",
        vehicle_vin: "1HGCM82633A004352",
        selling_price: 28500,
        submission_platform: "routeone",
        selected_lenders: [],
      },
    });
    expect(resp.status()).toBe(422);

    const data = await resp.json();
    expect(data.error).toContain("lender");
  });

  test("POST with missing deal_id returns 422", async ({ request }) => {
    const resp = await request.post("/api/admin/lender-routing", {
      data: {
        customer_name: "Test Customer",
        vehicle_vin: "1HGCM82633A004352",
        selling_price: 28500,
        submission_platform: "routeone",
        selected_lenders: ["lndr-tfs"],
      },
    });
    expect(resp.status()).toBe(422);

    const data = await resp.json();
    expect(data.error).toContain("deal_id");
  });

  test("POST with missing vehicle_vin returns 422", async ({ request }) => {
    const resp = await request.post("/api/admin/lender-routing", {
      data: {
        deal_id: "deal-test-005",
        customer_name: "Test Customer",
        selling_price: 28500,
        submission_platform: "routeone",
        selected_lenders: ["lndr-tfs"],
      },
    });
    expect(resp.status()).toBe(422);

    const data = await resp.json();
    expect(data.error).toContain("vehicle_vin");
  });

  test("POST with invalid submission_platform returns 422", async ({
    request,
  }) => {
    const resp = await request.post("/api/admin/lender-routing", {
      data: {
        deal_id: "deal-test-006",
        customer_name: "Test Customer",
        vehicle_vin: "1HGCM82633A004352",
        selling_price: 28500,
        submission_platform: "invalid_platform",
        selected_lenders: ["lndr-tfs"],
      },
    });
    expect(resp.status()).toBe(422);

    const data = await resp.json();
    expect(data.error).toContain("submission_platform");
  });

  test("POST truncates SSN to last 4 digits only", async ({ request }) => {
    const resp = await request.post("/api/admin/lender-routing", {
      data: {
        ...VALID_SUBMISSION,
        deal_id: "deal-test-ssn",
        ssn_last4: "123456789", // Full 9-digit SSN attempt
        selected_lenders: ["lndr-tfs"],
      },
    });
    expect(resp.status()).toBe(201);

    const data = await resp.json();
    for (const sub of data.submissions) {
      // Only last 4 should be stored
      if (sub.ssn_last4 !== null) {
        expect(sub.ssn_last4.length).toBeLessThanOrEqual(4);
        expect(sub.ssn_last4).toBe("6789");
      }
    }
  });
});

/* ========================================================================== */
/* API Tests — Single Submission (GET + PATCH)                                */
/* ========================================================================== */

test.describe("Lender Routing API — Single Submission", () => {
  test("GET /api/admin/lender-routing/[id] returns single submission", async ({
    request,
  }) => {
    const resp = await request.get("/api/admin/lender-routing/lrsub-001");
    expect(resp.status()).toBe(200);

    const data = await resp.json();
    expect(data).toHaveProperty("submission");
    expect(data.submission.id).toBe("lrsub-001");
    expect(data.submission.customer_name).toBe("James Rodriguez");
    expect(data.submission.lender_name).toBe("Toyota Financial Services");
    expect(data.submission.status).toBe("approved");
  });

  test("GET single submission includes detail fields", async ({ request }) => {
    const resp = await request.get("/api/admin/lender-routing/lrsub-001");
    expect(resp.status()).toBe(200);

    const sub = (await resp.json()).submission;
    expect(sub).toHaveProperty("vehicle_vin");
    expect(sub).toHaveProperty("vehicle_year");
    expect(sub).toHaveProperty("vehicle_make");
    expect(sub).toHaveProperty("vehicle_model");
    expect(sub).toHaveProperty("vehicle_selling_price");
    expect(sub).toHaveProperty("events");
    expect(Array.isArray(sub.events)).toBe(true);
    expect(sub.events.length).toBeGreaterThan(0);
  });

  test("GET non-existent submission returns 404", async ({ request }) => {
    const resp = await request.get(
      "/api/admin/lender-routing/lrsub-nonexistent",
    );
    expect(resp.status()).toBe(404);

    const data = await resp.json();
    expect(data.error).toContain("not found");
  });

  test("PATCH /api/admin/lender-routing/[id] with status accepted works", async ({
    request,
  }) => {
    const resp = await request.patch("/api/admin/lender-routing/lrsub-001", {
      data: { status: "accepted" },
    });
    expect(resp.status()).toBe(200);

    const data = await resp.json();
    expect(data).toHaveProperty("submission");
    expect(data).toHaveProperty("updated", true);
    expect(data.submission.status).toBe("accepted");
  });

  test("PATCH /api/admin/lender-routing/[id] with status funded works", async ({
    request,
  }) => {
    const resp = await request.patch("/api/admin/lender-routing/lrsub-001", {
      data: { status: "funded" },
    });
    expect(resp.status()).toBe(200);

    const data = await resp.json();
    expect(data.submission.status).toBe("funded");
    expect(data.updated).toBe(true);
  });

  test("PATCH /api/admin/lender-routing/[id] with status declined works", async ({
    request,
  }) => {
    const resp = await request.patch("/api/admin/lender-routing/lrsub-001", {
      data: { status: "declined" },
    });
    expect(resp.status()).toBe(200);

    const data = await resp.json();
    expect(data.submission.status).toBe("declined");
    expect(data.updated).toBe(true);
  });

  test("PATCH with invalid status returns 422", async ({ request }) => {
    const resp = await request.patch("/api/admin/lender-routing/lrsub-001", {
      data: { status: "invalid_status" },
    });
    expect(resp.status()).toBe(422);

    const data = await resp.json();
    expect(data.error).toContain("Invalid status");
  });

  test("PATCH with notes updates notes field", async ({ request }) => {
    const resp = await request.patch("/api/admin/lender-routing/lrsub-001", {
      data: { notes: "Updated via test" },
    });
    expect(resp.status()).toBe(200);

    const data = await resp.json();
    expect(data.submission.notes).toBe("Updated via test");
  });

  test("PATCH appends event to events timeline", async ({ request }) => {
    const resp = await request.patch("/api/admin/lender-routing/lrsub-001", {
      data: { status: "funded" },
    });
    expect(resp.status()).toBe(200);

    const data = await resp.json();
    const events = data.submission.events;
    expect(events.length).toBeGreaterThan(0);
    const lastEvent = events[events.length - 1];
    expect(lastEvent.action).toBe("funded");
    expect(lastEvent).toHaveProperty("timestamp");
    expect(lastEvent).toHaveProperty("by");
  });
});

/* ========================================================================== */
/* API Tests — Lenders Directory                                              */
/* ========================================================================== */

test.describe("Lender Routing API — Lenders Directory", () => {
  test("GET /api/admin/lender-routing/lenders returns 200 with lenders array", async ({
    request,
  }) => {
    const resp = await request.get("/api/admin/lender-routing/lenders");
    expect(resp.status()).toBe(200);

    const data = await resp.json();
    expect(data).toHaveProperty("lenders");
    expect(Array.isArray(data.lenders)).toBe(true);
    expect(data).toHaveProperty("total");
    expect(data.lenders.length).toBeGreaterThan(0);
    expect(data.total).toBe(data.lenders.length);
  });

  test("Lender response has correct structure", async ({ request }) => {
    const resp = await request.get("/api/admin/lender-routing/lenders");
    expect(resp.status()).toBe(200);

    const lender = (await resp.json()).lenders[0];
    expect(lender).toHaveProperty("id");
    expect(lender).toHaveProperty("name");
    expect(lender).toHaveProperty("type");
    expect(lender).toHaveProperty("platforms");
    expect(lender).toHaveProperty("min_score");
    expect(lender).toHaveProperty("max_ltv");
    expect(lender).toHaveProperty("specialties");
    expect(Array.isArray(lender.platforms)).toBe(true);
    expect(Array.isArray(lender.specialties)).toBe(true);
  });

  test("Lenders include all four categories: captive, national, regional, credit_union", async ({
    request,
  }) => {
    const resp = await request.get("/api/admin/lender-routing/lenders");
    expect(resp.status()).toBe(200);

    const lenders = (await resp.json()).lenders;
    const types = new Set(lenders.map((l: { type: string }) => l.type));
    expect(types.has("captive")).toBe(true);
    expect(types.has("national")).toBe(true);
    expect(types.has("regional")).toBe(true);
    expect(types.has("credit_union")).toBe(true);
  });

  test("Lenders filterable by platform=routeone", async ({ request }) => {
    const resp = await request.get(
      "/api/admin/lender-routing/lenders?platform=routeone",
    );
    expect(resp.status()).toBe(200);

    const lenders = (await resp.json()).lenders;
    expect(lenders.length).toBeGreaterThan(0);
    for (const l of lenders) {
      expect(l.platforms).toContain("routeone");
    }
  });

  test("Lenders filterable by platform=dealertrack", async ({ request }) => {
    const resp = await request.get(
      "/api/admin/lender-routing/lenders?platform=dealertrack",
    );
    expect(resp.status()).toBe(200);

    const lenders = (await resp.json()).lenders;
    expect(lenders.length).toBeGreaterThan(0);
    for (const l of lenders) {
      expect(l.platforms).toContain("dealertrack");
    }
  });

  test("Lenders filterable by platform=direct", async ({ request }) => {
    const resp = await request.get(
      "/api/admin/lender-routing/lenders?platform=direct",
    );
    expect(resp.status()).toBe(200);

    const lenders = (await resp.json()).lenders;
    expect(lenders.length).toBeGreaterThan(0);
    for (const l of lenders) {
      expect(l.platforms).toContain("direct");
    }
  });

  test("Lenders filterable by type=captive", async ({ request }) => {
    const resp = await request.get(
      "/api/admin/lender-routing/lenders?type=captive",
    );
    expect(resp.status()).toBe(200);

    const lenders = (await resp.json()).lenders;
    expect(lenders.length).toBeGreaterThan(0);
    for (const l of lenders) {
      expect(l.type).toBe("captive");
    }
  });

  test("Lenders filterable by type=credit_union", async ({ request }) => {
    const resp = await request.get(
      "/api/admin/lender-routing/lenders?type=credit_union",
    );
    expect(resp.status()).toBe(200);

    const lenders = (await resp.json()).lenders;
    expect(lenders.length).toBeGreaterThan(0);
    for (const l of lenders) {
      expect(l.type).toBe("credit_union");
    }
  });

  test("All lenders have valid min_score and max_ltv", async ({ request }) => {
    const resp = await request.get("/api/admin/lender-routing/lenders");
    expect(resp.status()).toBe(200);

    const lenders = (await resp.json()).lenders;
    for (const l of lenders) {
      expect(typeof l.min_score).toBe("number");
      expect(l.min_score).toBeGreaterThanOrEqual(300);
      expect(l.min_score).toBeLessThanOrEqual(850);
      expect(typeof l.max_ltv).toBe("number");
      expect(l.max_ltv).toBeGreaterThan(100);
    }
  });
});

/* ========================================================================== */
/* Page Tests — /admin/lender-routing                                         */
/* ========================================================================== */

test.describe("Lender Routing Page — Rendering", () => {
  test("/admin/lender-routing loads with 200 status", async ({ page }) => {
    const resp = await page.goto("/admin/lender-routing", {
      waitUntil: "domcontentloaded",
    });
    expect(resp?.status()).toBe(200);
  });

  test("Page has 'Lender Routing' heading", async ({ page }) => {
    await page.goto("/admin/lender-routing", { waitUntil: "domcontentloaded" });
    const heading = page.locator("h1");
    await expect(heading).toContainText("Lender Routing");
  });

  test("Page has subtitle about RouteOne and DealerTrack", async ({
    page,
  }) => {
    await page.goto("/admin/lender-routing", { waitUntil: "domcontentloaded" });
    await expect(page.locator("text=RouteOne").first()).toBeAttached();
    await expect(page.locator("text=DealerTrack").first()).toBeAttached();
  });

  test("Stats cards visible — Active Submissions, Approval Rate, Best Rate, Avg Response", async ({
    page,
  }) => {
    await page.goto("/admin/lender-routing", { waitUntil: "networkidle" });

    // Wait for loading to complete
    await page.waitForSelector("text=Loading submissions...", {
      state: "hidden",
      timeout: 10000,
    }).catch(() => {});

    await expect(page.locator("text=Active Submissions")).toBeVisible();
    await expect(page.locator("text=Approval Rate")).toBeVisible();
    await expect(page.locator("text=Best Rate")).toBeVisible();
    await expect(page.locator("text=Avg Response")).toBeVisible();
  });

  test("'New Submission' button is visible", async ({ page }) => {
    await page.goto("/admin/lender-routing", { waitUntil: "domcontentloaded" });
    const button = page.locator("button", { hasText: /New Submission/i });
    await expect(button).toBeAttached();
  });

  test("Submissions table is present after loading", async ({ page }) => {
    await page.goto("/admin/lender-routing", { waitUntil: "networkidle" });

    // Wait for loading to complete
    await page.waitForSelector("text=Loading submissions...", {
      state: "hidden",
      timeout: 10000,
    }).catch(() => {});

    // Table should be present
    const table = page.locator("table");
    await expect(table).toBeVisible();

    // Table should have expected column headers
    const thead = page.locator("thead");
    await expect(thead.locator("th", { hasText: "Customer" })).toBeVisible();
    await expect(thead.locator("th", { hasText: "Lender" })).toBeVisible();
    await expect(thead.locator("th", { hasText: "Status" })).toBeVisible();
  });

  test("Filter dropdowns are present", async ({ page }) => {
    await page.goto("/admin/lender-routing", { waitUntil: "networkidle" });

    // Status filter select should be visible
    const selects = page.locator("select");
    await expect(selects.first()).toBeVisible();

    // Should have "All Statuses" option in one of the selects
    await expect(page.locator("option", { hasText: "All Statuses" })).toBeAttached();
  });
});
