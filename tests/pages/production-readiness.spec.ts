import { test, expect } from "@playwright/test";

test.describe("Production Readiness", () => {
  // ── Custom Error Pages ──

  test("404 page renders with branded content", async ({ page }) => {
    await page.goto("/this-page-does-not-exist-xyz");
    const content = await page.textContent("body");
    expect(content).toContain("404");
    expect(content).toContain("Page Not Found");
    // Should have Go Home and Browse Inventory links in the 404 content
    await expect(page.locator('a:has-text("Go Home")').first()).toBeVisible();
    await expect(page.locator('a:has-text("Browse Inventory")').first()).toBeVisible();
  });

  // ── Photo Gallery ──

  test("VDP has interactive photo gallery with thumbnails", async ({ page }) => {
    await page.goto("/inventory/1HGCV1F34PA000001");
    // Should have thumbnail buttons
    const thumbs = page.locator('button[aria-label^="View photo"]');
    expect(await thumbs.count()).toBeGreaterThanOrEqual(4);
  });

  test("VDP photo gallery switches main image on thumbnail click", async ({ page }) => {
    await page.goto("/inventory/1HGCV1F34PA000001");
    // Click second thumbnail
    const secondThumb = page.locator('button[aria-label="View photo 2"]');
    await secondThumb.click();
    // Second thumb should now be active (ring-brand-500)
    await expect(secondThumb).toHaveAttribute("aria-pressed", "true");
  });

  test("VDP photo gallery opens lightbox on main image click", async ({ page }) => {
    await page.goto("/inventory/1HGCV1F34PA000001");
    await page.locator('button[aria-label="Open photo gallery"]').click();
    // Lightbox should be visible
    const lightbox = page.locator('[role="dialog"]');
    await expect(lightbox).toBeVisible();
    // Close button should be present
    await expect(page.locator('button[aria-label="Close gallery"]')).toBeVisible();
  });

  test("VDP lightbox closes on Escape key", async ({ page }) => {
    await page.goto("/inventory/1HGCV1F34PA000001");
    await page.locator('button[aria-label="Open photo gallery"]').click();
    await expect(page.locator('[role="dialog"]')).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator('[role="dialog"]')).not.toBeVisible();
  });

  test("VDP lightbox navigates with arrow keys", async ({ page }) => {
    await page.goto("/inventory/1HGCV1F34PA000001");
    await page.locator('button[aria-label="Open photo gallery"]').click();
    const lightbox = page.locator('[role="dialog"]');
    await expect(lightbox).toBeVisible();
    // Counter should show photo number
    const counter = lightbox.locator('text=/\\d+ \\/ \\d+/');
    await expect(counter).toBeVisible();
    const initialText = await counter.textContent();
    await page.keyboard.press("ArrowRight");
    const nextText = await lightbox.locator('text=/\\d+ \\/ \\d+/').textContent();
    expect(nextText).not.toBe(initialText);
  });

  // ── Payment Calculator ──

  test("VDP has functional payment calculator with loan/lease toggle", async ({ page }) => {
    await page.goto("/inventory/1HGCV1F34PA000001");
    await expect(page.locator("text=Payment Calculator")).toBeVisible();
    // Should have Finance/Lease tabs
    await expect(page.locator('button[role="tab"]:has-text("Finance")')).toBeVisible();
    await expect(page.locator('button[role="tab"]:has-text("Lease")')).toBeVisible();
  });

  test("payment calculator shows estimated monthly payment", async ({ page }) => {
    await page.goto("/inventory/1HGCV1F34PA000001");
    const payment = page.locator("text=Estimated Monthly Payment");
    await expect(payment).toBeVisible();
    // Should show a dollar amount
    const amountText = await page.locator("text=/\\$\\d+/").first().textContent();
    expect(amountText).toBeTruthy();
  });

  test("payment calculator switches between loan and lease modes", async ({ page }) => {
    await page.goto("/inventory/1HGCV1F34PA000001");
    // Start on Finance tab
    const financeTab = page.locator('button[role="tab"]:has-text("Finance")');
    await expect(financeTab).toBeVisible();
    // Switch to Lease
    const leaseTab = page.locator('button[role="tab"]:has-text("Lease")');
    await leaseTab.click();
    await expect(leaseTab).toHaveAttribute("aria-selected", "true");
    // Should show lease-specific summary
    const content = await page.textContent("body");
    expect(content).toContain("Capitalized Cost");
  });

  test("payment calculator has Reg Z disclosure", async ({ page }) => {
    await page.goto("/inventory/1HGCV1F34PA000001");
    const disclosure = await page.textContent("body");
    expect(disclosure).toContain("estimates only");
  });

  // ── DMS Feed API ──

  test("DMS feed health check returns supported sources", async ({ request }) => {
    const res = await request.get("/api/inventory/feed");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ready");
    expect(body.supported_sources).toContain("vauto");
    expect(body.supported_sources).toContain("dealersocket");
    expect(body.max_batch_size).toBe(500);
  });

  test("DMS feed accepts valid vehicle batch", async ({ request }) => {
    const res = await request.post("/api/inventory/feed", {
      data: {
        dealer_id: "test-dealer",
        source: "manual",
        vehicles: [
          {
            vin: "1TESTVIN00000001",
            year: 2024,
            make: "TestMake",
            model: "TestModel",
            trim: "Base",
            price: 30000,
            mileage: 0,
            condition: "New",
          },
        ],
      },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.accepted).toBe(1);
    expect(body.vins).toContain("1TESTVIN00000001");
  });

  test("DMS feed rejects invalid vehicle data", async ({ request }) => {
    const res = await request.post("/api/inventory/feed", {
      data: {
        dealer_id: "test-dealer",
        source: "manual",
        vehicles: [
          { vin: "too-short", year: 1800 }, // Invalid
        ],
      },
    });
    expect(res.status()).toBe(422);
    const body = await res.json();
    expect(body.error).toBe("validation_failed");
  });

  test("DMS feed rejects empty vehicle array", async ({ request }) => {
    const res = await request.post("/api/inventory/feed", {
      data: {
        dealer_id: "test-dealer",
        source: "manual",
        vehicles: [],
      },
    });
    expect(res.status()).toBe(422);
  });

  // ── Dealer Branding Config ──

  test("site loads with default Wolfpack Motors branding", async ({ page }) => {
    await page.goto("/");
    const content = await page.textContent("body");
    expect(content).toContain("Wolfpack");
  });
});
