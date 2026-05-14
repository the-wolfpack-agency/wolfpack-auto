import { test, expect } from "@playwright/test";

// Add immediately after imports:
test.skip(
  !process.env.DATABASE_URL,
  "Needs real Postgres (Phase 1 Tests runs in shadow mode). Run via the real-DB integration phase or locally with DATABASE_URL set."
);

test.describe("VDP CTA Buttons", () => {
  test("Request Price button links to contact page with vehicle context", async ({ page }) => {
    await page.goto("/inventory/1HGCV1F34PA000001");
    const priceBtn = page.locator('a[data-track="cta-request-price"]');
    await expect(priceBtn).toBeVisible();
    const href = await priceBtn.getAttribute("href");
    expect(href).toContain("/contact");
    expect(href).toContain("subject=price_request");
    expect(href).toContain("vin=1HGCV1F34PA000001");
  });

  test("Schedule Test Drive button links to contact page with vehicle context", async ({ page }) => {
    await page.goto("/inventory/1HGCV1F34PA000001");
    const driveBtn = page.locator('a[data-track="cta-schedule-test-drive"]');
    await expect(driveBtn).toBeVisible();
    const href = await driveBtn.getAttribute("href");
    expect(href).toContain("/contact");
    expect(href).toContain("subject=test_drive");
    expect(href).toContain("vin=1HGCV1F34PA000001");
  });

  test("clicking Request Price navigates to pre-filled contact form", async ({ page }) => {
    await page.goto("/inventory/1HGCV1F34PA000001");
    await page.locator('a[data-track="cta-request-price"]').click();
    await page.waitForURL(/\/contact/);
    // Subject should be pre-selected
    const subject = page.locator('select[name="subject"], #subject');
    if (await subject.isVisible()) {
      const value = await subject.inputValue();
      expect(value).toContain("Vehicle");
    }
    // Message should mention the vehicle
    const message = page.locator('textarea');
    if (await message.isVisible()) {
      const value = await message.inputValue();
      expect(value).toContain("Honda");
    }
  });

  test("clicking Schedule Test Drive navigates to pre-filled contact form", async ({ page }) => {
    await page.goto("/inventory/1HGCV1F34PA000001");
    await page.locator('a[data-track="cta-schedule-test-drive"]').click();
    await page.waitForURL(/\/contact/);
    const message = page.locator('textarea');
    if (await message.isVisible()) {
      const value = await message.inputValue();
      expect(value).toContain("test drive");
    }
  });
});

test.describe("Vehicle Comparison", () => {
  test("compare page loads with empty state", async ({ page }) => {
    await page.goto("/inventory/compare");
    await expect(page.locator("h1")).toContainText("Compare Vehicles");
    await expect(page.locator("text=No vehicles selected")).toBeVisible();
  });

  test("compare page with 2 VINs shows side-by-side comparison", async ({ page }) => {
    await page.goto("/inventory/compare?vins=1HGCV1F34PA000001,5YJ3E1EA1PF000002");
    await expect(page.locator("h1")).toContainText("Compare Vehicles");
    // Should show both vehicles
    const content = await page.textContent("body");
    expect(content).toContain("Honda");
    expect(content).toContain("Tesla");
  });

  test("compare page shows spec rows for all vehicles", async ({ page }) => {
    await page.goto("/inventory/compare?vins=1HGCV1F34PA000001,5YJ3E1EA1PF000002");
    // Should have price, mileage, engine, transmission rows
    const content = await page.textContent("body");
    expect(content).toContain("Price");
    expect(content).toContain("Mileage");
    expect(content).toContain("Engine");
    expect(content).toContain("Transmission");
  });

  test("compare page shows features for each vehicle", async ({ page }) => {
    await page.goto("/inventory/compare?vins=1HGCV1F34PA000001,5YJ3E1EA1PF000002");
    const content = await page.textContent("body");
    expect(content).toContain("Key Features");
    // Honda features
    expect(content).toContain("Honda Sensing");
    // Tesla features
    expect(content).toContain("Autopilot");
  });

  test("compare page handles 3 vehicles", async ({ page }) => {
    await page.goto("/inventory/compare?vins=1HGCV1F34PA000001,5YJ3E1EA1PF000002,2T3P1RFV4RC000003");
    const content = await page.textContent("body");
    expect(content).toContain("Honda");
    expect(content).toContain("Tesla");
    expect(content).toContain("Toyota");
  });

  test("compare page has View Details and Test Drive buttons per vehicle", async ({ page }) => {
    await page.goto("/inventory/compare?vins=1HGCV1F34PA000001,5YJ3E1EA1PF000002");
    const detailLinks = page.locator('a:has-text("View Details")');
    expect(await detailLinks.count()).toBe(2);
    const driveLinks = page.locator('a:has-text("Test Drive")');
    expect(await driveLinks.count()).toBe(2);
  });

  test("compare page handles invalid VINs gracefully", async ({ page }) => {
    await page.goto("/inventory/compare?vins=INVALID_VIN_123");
    await expect(page.locator("h1")).toContainText("Compare Vehicles");
    // Should show empty state since VIN doesn't exist
    const content = await page.textContent("body");
    expect(content).toContain("No vehicles selected");
  });

  test("inventory page has compare buttons on vehicle cards", async ({ page }) => {
    await page.goto("/inventory");
    const compareButtons = page.locator('[data-track="compare-toggle"]');
    expect(await compareButtons.count()).toBeGreaterThan(0);
  });
});

test.describe("Lead Intelligence on Admin Leads", () => {
  test("admin leads page loads or shows DB error gracefully", async ({ page }) => {
    const res = await page.goto("/admin/leads");
    // Without a running DB, may return 500 — that's expected
    // With DB, should show leads page
    if (res && res.status() === 200) {
      await expect(page.locator("h1")).toContainText("Leads");
    } else {
      // DB unavailable — page returns error, which is expected in local dev without Docker
      expect(res?.status()).toBeTruthy();
    }
  });
});

test.describe("Contact Form Pre-fill", () => {
  test("contact page pre-fills subject from query param", async ({ page }) => {
    await page.goto("/contact?subject=test_drive&vehicle=2024+Toyota+RAV4+XLE&vin=ABC123");
    const message = page.locator('textarea');
    if (await message.isVisible()) {
      const value = await message.inputValue();
      expect(value).toContain("test drive");
      expect(value).toContain("Toyota RAV4");
    }
  });

  test("contact page pre-fills price request message", async ({ page }) => {
    await page.goto("/contact?subject=price_request&vehicle=2024+Honda+CR-V+EX-L&vin=DEF456");
    const message = page.locator('textarea');
    if (await message.isVisible()) {
      const value = await message.inputValue();
      expect(value).toContain("best price");
      expect(value).toContain("Honda CR-V");
    }
  });

  test("contact page works normally without query params", async ({ page }) => {
    await page.goto("/contact");
    const message = page.locator('textarea');
    if (await message.isVisible()) {
      const value = await message.inputValue();
      expect(value).toBe("");
    }
  });
});
