/**
 * Vehicle History — E2E Tests
 *
 * Covers the Vehicle History feature end-to-end:
 *   - API routes: GET/POST /api/admin/vehicle-history, GET /api/admin/vehicle-history/[vin]
 *   - Page rendering: /admin/vehicle-history
 *
 * All tests run against DEMO_MODE shadow data and must assert 200 (not just "not 500").
 * A non-200 on any admin API means a white page for the dealer user.
 */

import { test, expect } from "@playwright/test";

/* -------------------------------------------------------------------------- */
/* Known mock VINs from the shadow dataset                                    */
/* -------------------------------------------------------------------------- */

const KNOWN_VINS = {
  camry: "4T1G11AK5RU123456",
  crv: "7FARS6H79RE045678",
  f150: "1FTFW1E80RFA12345",
  bmw: "5UX43DP05R9E78901",
  lexus: "2T2HZMDA4PC123456",
};

/** A VIN that does not exist in mock data but is structurally valid */
const VALID_UNKNOWN_VIN = "1G1YY22G965104367";

/* -------------------------------------------------------------------------- */
/* API Tests — GET /api/admin/vehicle-history                                 */
/* -------------------------------------------------------------------------- */

test.describe("API — GET /api/admin/vehicle-history", () => {
  test("returns 200 with reports array", async ({ request }) => {
    const resp = await request.get("/api/admin/vehicle-history");
    expect(resp.status()).toBe(200);

    const data = await resp.json();
    expect(data).toHaveProperty("reports");
    expect(Array.isArray(data.reports)).toBe(true);
    expect(data).toHaveProperty("total");
    expect(typeof data.total).toBe("number");
  });

  test("returns reports with correct structure", async ({ request }) => {
    const resp = await request.get("/api/admin/vehicle-history");
    expect(resp.status()).toBe(200);

    const data = await resp.json();
    expect(data.reports.length).toBeGreaterThan(0);

    const report = data.reports[0];
    // Top-level report fields
    expect(report).toHaveProperty("id");
    expect(report).toHaveProperty("vin");
    expect(report).toHaveProperty("provider");
    expect(report).toHaveProperty("vehicle_description");
    expect(report).toHaveProperty("pulled_at");
    expect(report).toHaveProperty("expires_at");
    expect(report).toHaveProperty("report_url");
    expect(report).toHaveProperty("summary");
    expect(report).toHaveProperty("history_entries");
    expect(report).toHaveProperty("value_impact");
  });

  test("filters by VIN query param", async ({ request }) => {
    const resp = await request.get(
      `/api/admin/vehicle-history?vin=${KNOWN_VINS.camry}`,
    );
    expect(resp.status()).toBe(200);

    const data = await resp.json();
    expect(data.reports.length).toBe(1);
    expect(data.reports[0].vin).toBe(KNOWN_VINS.camry);
    expect(data.total).toBe(1);
  });

  test("filters by provider query param", async ({ request }) => {
    const resp = await request.get(
      "/api/admin/vehicle-history?provider=autocheck",
    );
    expect(resp.status()).toBe(200);

    const data = await resp.json();
    for (const report of data.reports) {
      expect(report.provider).toBe("autocheck");
    }
  });

  test("returns empty array for non-matching VIN filter", async ({ request }) => {
    const resp = await request.get(
      `/api/admin/vehicle-history?vin=${VALID_UNKNOWN_VIN}`,
    );
    expect(resp.status()).toBe(200);

    const data = await resp.json();
    expect(data.reports).toEqual([]);
    expect(data.total).toBe(0);
  });
});

/* -------------------------------------------------------------------------- */
/* API Tests — POST /api/admin/vehicle-history                                */
/* -------------------------------------------------------------------------- */

test.describe("API — POST /api/admin/vehicle-history", () => {
  test("pulls report for a known VIN and returns 200", async ({ request }) => {
    const resp = await request.post("/api/admin/vehicle-history", {
      data: { vin: KNOWN_VINS.camry, provider: "carfax" },
    });
    // Known VINs return cached → 200
    expect(resp.status()).toBe(200);

    const data = await resp.json();
    expect(data).toHaveProperty("report");
    expect(data.report.vin).toBe(KNOWN_VINS.camry);
  });

  test("pulls report for unknown valid VIN and returns 201", async ({ request }) => {
    const resp = await request.post("/api/admin/vehicle-history", {
      data: { vin: VALID_UNKNOWN_VIN, provider: "carfax" },
    });
    expect(resp.status()).toBe(201);

    const data = await resp.json();
    expect(data).toHaveProperty("report");
    expect(data.report.vin).toBe(VALID_UNKNOWN_VIN);
    expect(data.created).toBe(true);
  });

  test("rejects VIN shorter than 17 characters with 422", async ({ request }) => {
    const resp = await request.post("/api/admin/vehicle-history", {
      data: { vin: "ABC123", provider: "carfax" },
    });
    expect(resp.status()).toBe(422);

    const data = await resp.json();
    expect(data).toHaveProperty("error");
    expect(data.error).toContain("Invalid VIN");
  });

  test("rejects VIN longer than 17 characters with 422", async ({ request }) => {
    const resp = await request.post("/api/admin/vehicle-history", {
      data: { vin: "4T1G11AK5RU123456X", provider: "carfax" },
    });
    expect(resp.status()).toBe(422);

    const data = await resp.json();
    expect(data.error).toContain("Invalid VIN");
  });

  test("rejects VIN containing letter I with 422", async ({ request }) => {
    // Replace a valid char with 'I'
    const resp = await request.post("/api/admin/vehicle-history", {
      data: { vin: "4T1G11AK5RI12345A", provider: "carfax" },
    });
    expect(resp.status()).toBe(422);

    const data = await resp.json();
    expect(data.error).toContain("Invalid VIN");
  });

  test("rejects VIN containing letter O with 422", async ({ request }) => {
    const resp = await request.post("/api/admin/vehicle-history", {
      data: { vin: "4T1G11AK5RO12345A", provider: "carfax" },
    });
    expect(resp.status()).toBe(422);

    const data = await resp.json();
    expect(data.error).toContain("Invalid VIN");
  });

  test("rejects VIN containing letter Q with 422", async ({ request }) => {
    const resp = await request.post("/api/admin/vehicle-history", {
      data: { vin: "4T1G11AK5RQ12345A", provider: "carfax" },
    });
    expect(resp.status()).toBe(422);

    const data = await resp.json();
    expect(data.error).toContain("Invalid VIN");
  });

  test("rejects missing VIN with 422", async ({ request }) => {
    const resp = await request.post("/api/admin/vehicle-history", {
      data: { provider: "carfax" },
    });
    expect(resp.status()).toBe(422);

    const data = await resp.json();
    expect(data.error).toContain("Missing required field");
  });

  test("rejects invalid JSON body with 400", async ({ request }) => {
    const resp = await request.post("/api/admin/vehicle-history", {
      headers: { "Content-Type": "application/json" },
      data: "not-json{{{",
    });
    // Could be 400 (invalid JSON) or 422 (parsed as something without vin)
    expect([400, 422]).toContain(resp.status());
  });

  test("report summary has all required fields", async ({ request }) => {
    const resp = await request.get(
      `/api/admin/vehicle-history?vin=${KNOWN_VINS.f150}`,
    );
    expect(resp.status()).toBe(200);

    const data = await resp.json();
    const summary = data.reports[0].summary;

    expect(summary).toHaveProperty("title_status");
    expect(summary).toHaveProperty("owners");
    expect(summary).toHaveProperty("accidents");
    expect(summary).toHaveProperty("service_records");
    expect(summary).toHaveProperty("open_recalls");
    expect(summary).toHaveProperty("odometer_status");
    expect(summary).toHaveProperty("structural_damage");
    expect(summary).toHaveProperty("airbag_deployed");
    expect(summary).toHaveProperty("theft_reported");

    expect(typeof summary.owners).toBe("number");
    expect(typeof summary.accidents).toBe("number");
    expect(typeof summary.structural_damage).toBe("boolean");
  });

  test("report includes history_entries array", async ({ request }) => {
    const resp = await request.get(
      `/api/admin/vehicle-history?vin=${KNOWN_VINS.camry}`,
    );
    expect(resp.status()).toBe(200);

    const data = await resp.json();
    const entries = data.reports[0].history_entries;

    expect(Array.isArray(entries)).toBe(true);
    expect(entries.length).toBeGreaterThan(0);

    const entry = entries[0];
    expect(entry).toHaveProperty("date");
    expect(entry).toHaveProperty("description");
    expect(entry).toHaveProperty("mileage");
    expect(entry).toHaveProperty("source");
    expect(entry).toHaveProperty("category");
  });

  test("report includes value_impact with numeric score", async ({ request }) => {
    const resp = await request.get(
      `/api/admin/vehicle-history?vin=${KNOWN_VINS.bmw}`,
    );
    expect(resp.status()).toBe(200);

    const data = await resp.json();
    const vi = data.reports[0].value_impact;

    expect(vi).toHaveProperty("score");
    expect(typeof vi.score).toBe("number");
    expect(vi.score).toBeGreaterThanOrEqual(0);
    expect(vi.score).toBeLessThanOrEqual(100);
    expect(vi).toHaveProperty("factors_positive");
    expect(vi).toHaveProperty("factors_negative");
    expect(Array.isArray(vi.factors_positive)).toBe(true);
    expect(Array.isArray(vi.factors_negative)).toBe(true);
  });

  test("rejects invalid provider with 422", async ({ request }) => {
    const resp = await request.post("/api/admin/vehicle-history", {
      data: { vin: VALID_UNKNOWN_VIN, provider: "not-a-provider" },
    });
    expect(resp.status()).toBe(422);

    const data = await resp.json();
    expect(data.error).toContain("Invalid provider");
  });
});

/* -------------------------------------------------------------------------- */
/* API Tests — GET /api/admin/vehicle-history/[vin]                           */
/* -------------------------------------------------------------------------- */

test.describe("API — GET /api/admin/vehicle-history/[vin]", () => {
  test("returns cached report for known VIN", async ({ request }) => {
    const resp = await request.get(
      `/api/admin/vehicle-history/${KNOWN_VINS.camry}`,
    );
    expect(resp.status()).toBe(200);

    const data = await resp.json();
    expect(data).toHaveProperty("report");
    expect(data.report).not.toBeNull();
    expect(data.report.vin).toBe(KNOWN_VINS.camry);
    expect(data.report.vehicle_description).toContain("Toyota Camry");
    expect(data).toHaveProperty("expired");
    expect(typeof data.expired).toBe("boolean");
  });

  test("returns 404 for unknown VIN", async ({ request }) => {
    const resp = await request.get(
      `/api/admin/vehicle-history/${VALID_UNKNOWN_VIN}`,
    );
    expect(resp.status()).toBe(404);

    const data = await resp.json();
    expect(data.report).toBeNull();
    expect(data).toHaveProperty("message");
    expect(data.message).toContain("No report found");
  });

  test("returns 422 for structurally invalid VIN", async ({ request }) => {
    const resp = await request.get("/api/admin/vehicle-history/INVALID");
    expect(resp.status()).toBe(422);

    const data = await resp.json();
    expect(data.error).toContain("Invalid VIN");
  });

  test("cached report has full summary structure", async ({ request }) => {
    const resp = await request.get(
      `/api/admin/vehicle-history/${KNOWN_VINS.f150}`,
    );
    expect(resp.status()).toBe(200);

    const { report } = await resp.json();
    expect(report.summary.title_status).toBe("clean");
    expect(report.summary.owners).toBe(2);
    expect(report.summary.accidents).toBe(1);
    expect(report.summary.service_records).toBe(8);
    expect(report.value_impact.score).toBe(71);
  });

  test("returns different reports for different VINs", async ({ request }) => {
    const [respA, respB] = await Promise.all([
      request.get(`/api/admin/vehicle-history/${KNOWN_VINS.camry}`),
      request.get(`/api/admin/vehicle-history/${KNOWN_VINS.bmw}`),
    ]);

    expect(respA.status()).toBe(200);
    expect(respB.status()).toBe(200);

    const dataA = await respA.json();
    const dataB = await respB.json();

    expect(dataA.report.vin).toBe(KNOWN_VINS.camry);
    expect(dataB.report.vin).toBe(KNOWN_VINS.bmw);
    expect(dataA.report.id).not.toBe(dataB.report.id);
  });
});

/* -------------------------------------------------------------------------- */
/* Page Tests — /admin/vehicle-history                                        */
/* -------------------------------------------------------------------------- */

test.describe("Page — /admin/vehicle-history", () => {
  test("page loads with 200 status", async ({ page }) => {
    const resp = await page.goto("/admin/vehicle-history");
    expect(resp).not.toBeNull();
    expect(resp!.status()).toBe(200);
  });

  test("page has Vehicle History heading", async ({ page }) => {
    await page.goto("/admin/vehicle-history");
    const heading = page.getByRole("heading", { name: /Vehicle History/i });
    await expect(heading).toBeVisible();
  });

  test("stats cards are visible", async ({ page }) => {
    await page.goto("/admin/vehicle-history");

    // Wait for data to load — the stats cards appear after API fetch completes
    await page.waitForResponse((r) =>
      r.url().includes("/api/admin/vehicle-history") && r.status() === 200,
    );

    await expect(page.getByText("Reports Pulled")).toBeVisible();
    await expect(page.getByText("Clean Titles")).toBeVisible();
    await expect(page.getByText("Issues Found")).toBeVisible();
    await expect(page.getByText("Avg Value Score")).toBeVisible();
  });

  test("VIN search bar is prominently displayed", async ({ page }) => {
    await page.goto("/admin/vehicle-history");

    await expect(page.getByText("Quick VIN Lookup")).toBeVisible();
    await expect(
      page.getByPlaceholder(/Enter a 17-character VIN/i),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: /Look Up/i })).toBeVisible();
  });

  test("reports table renders with mock data", async ({ page }) => {
    await page.goto("/admin/vehicle-history");

    // Wait for reports to load
    await page.waitForResponse((r) =>
      r.url().includes("/api/admin/vehicle-history") && r.status() === 200,
    );

    // Table headers
    await expect(page.getByText("VIN / Vehicle")).toBeVisible();

    // At least one known VIN in the table
    await expect(page.getByText(KNOWN_VINS.camry)).toBeVisible();
  });

  test("title status badges render with correct text", async ({ page }) => {
    await page.goto("/admin/vehicle-history");

    await page.waitForResponse((r) =>
      r.url().includes("/api/admin/vehicle-history") && r.status() === 200,
    );

    // All mock reports have "clean" title status
    const cleanBadges = page.locator("span", { hasText: "Clean" }).filter({
      has: page.locator('[class*="ring-green"]'),
    });
    // There should be at least one clean badge (from the mock data)
    await expect(cleanBadges.first()).toBeVisible();
  });

  test("Pull Report button is visible and clickable", async ({ page }) => {
    await page.goto("/admin/vehicle-history");

    const pullBtn = page.getByRole("button", { name: /Pull Report/i });
    await expect(pullBtn).toBeVisible();

    // Click should open the modal
    await pullBtn.click();

    // Modal should appear with VIN input
    await expect(
      page.getByPlaceholder(/Enter VIN/i).or(page.getByLabel(/VIN/i)),
    ).toBeVisible();
  });

  test("provider filter dropdown is present", async ({ page }) => {
    await page.goto("/admin/vehicle-history");

    const providerSelect = page.locator("select");
    await expect(providerSelect).toBeVisible();

    // Should have provider options
    await expect(providerSelect.locator("option", { hasText: "All Providers" })).toBeAttached();
    await expect(providerSelect.locator("option", { hasText: "Carfax" })).toBeAttached();
    await expect(providerSelect.locator("option", { hasText: "AutoCheck" })).toBeAttached();
  });

  test("vehicle descriptions appear alongside VINs", async ({ page }) => {
    await page.goto("/admin/vehicle-history");

    await page.waitForResponse((r) =>
      r.url().includes("/api/admin/vehicle-history") && r.status() === 200,
    );

    // Mock data includes vehicle descriptions
    await expect(page.getByText("2024 Toyota Camry XSE")).toBeVisible();
  });
});
