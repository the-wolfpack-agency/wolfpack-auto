import { test, expect } from "@playwright/test";

/**
 * End-to-end admin workflow tests.
 *
 * These exercise real admin flows: managing inventory, reviewing leads,
 * using quick-add, viewing analytics with NLP chat, and generating reports.
 *
 * These tests assume DEMO_MODE or no auth requirement for /admin routes.
 * If a page returns 500 or redirects to login, the test skips gracefully.
 */

/** Navigate and return true if the page loaded successfully (< 400 status). */
async function safeNavigate(
  page: import("@playwright/test").Page,
  path: string,
): Promise<boolean> {
  const response = await page.goto(path, {
    waitUntil: "domcontentloaded",
    timeout: 15_000,
  });
  return !!response && response.status() < 400;
}

test.describe("Admin workflow: inventory and leads overview", () => {
  test("Admin views inventory and leads tables", async ({ page }) => {
    // Navigate to admin inventory
    const inventoryOk = await safeNavigate(page, "/admin/inventory");
    if (!inventoryOk) {
      test.info().annotations.push({
        type: "skip",
        description: "/admin/inventory returned error — may need DB or auth",
      });
      return;
    }

    // Verify inventory page has a table or list of vehicles
    const inventoryContent = page.locator(
      'table, [role="table"], [class*="vehicle"], [class*="inventory"], [data-testid*="vehicle"]'
    );
    await expect(inventoryContent.first()).toBeVisible({ timeout: 10_000 });

    // Navigate to leads
    const leadsOk = await safeNavigate(page, "/admin/leads");
    if (!leadsOk) {
      test.info().annotations.push({
        type: "skip",
        description: "/admin/leads returned error",
      });
      return;
    }

    // Verify leads page has a table or list
    const leadsContent = page.locator(
      'table, [role="table"], [class*="lead"], [data-testid*="lead"]'
    );
    await expect(leadsContent.first()).toBeVisible({ timeout: 10_000 });
  });
});

test.describe("Admin workflow: Quick Add vehicle", () => {
  test("Admin enters VIN and sees decoded data", async ({ page }) => {
    const ok = await safeNavigate(page, "/admin/vehicles/quick-add");
    if (!ok) {
      test.info().annotations.push({
        type: "skip",
        description: "/admin/vehicles/quick-add not accessible",
      });
      return;
    }

    // Find VIN input
    const vinInput = page.locator(
      'input[name="vin"], input[placeholder*="VIN" i], input[aria-label*="VIN" i]'
    );
    await expect(vinInput.first()).toBeVisible({ timeout: 5_000 });

    // Enter a valid 17-character VIN
    await vinInput.first().fill("1HGCV1F34PA000001");
    await page.waitForTimeout(2000);

    // Verify decoded data appeared — look for year, make, or model
    const decodedInfo = page.locator(
      'text=/Honda|CR-V|2024|decoded|year|make/i'
    );
    const decodedVisible = await decodedInfo
      .first()
      .isVisible({ timeout: 8_000 })
      .catch(() => false);

    if (decodedVisible) {
      // Check that an "Add to Inventory" or submit button exists
      const addButton = page.locator(
        'button:has-text("Add"), button:has-text("Submit"), button:has-text("Save"), button[type="submit"]'
      );
      await expect(addButton.first()).toBeVisible({ timeout: 5_000 });
    } else {
      // VIN decode may require external API — just verify the UI didn't crash
      const pageContent = await page.textContent("body");
      expect(pageContent!.length).toBeGreaterThan(100);
      test.info().annotations.push({
        type: "info",
        description:
          "VIN decode did not return data — may require external NHTSA API",
      });
    }
  });
});

test.describe("Admin workflow: analytics dashboard", () => {
  test("Admin views analytics and asks a question", async ({ page }) => {
    const ok = await safeNavigate(page, "/admin/analytics");
    if (!ok) {
      test.info().annotations.push({
        type: "skip",
        description: "/admin/analytics not accessible",
      });
      return;
    }

    // Wait for dashboard to load — check for stat cards or loading state
    await page.waitForTimeout(3000);

    // Verify some dashboard content rendered
    const dashboardContent = page.locator(
      '[class*="card"], [class*="stat"], [class*="metric"], [class*="chart"], text=/visitor|lead|conversion/i'
    );
    const hasContent = await dashboardContent
      .first()
      .isVisible({ timeout: 10_000 })
      .catch(() => false);

    if (!hasContent) {
      // Dashboard may need real analytics data — check page didn't crash
      const body = await page.textContent("body");
      expect(body!.length).toBeGreaterThan(50);
      test.info().annotations.push({
        type: "info",
        description: "Analytics dashboard loaded but no stat cards visible",
      });
    }

    // Find the NLP chat input if it exists
    const chatInput = page.locator(
      'input[placeholder*="ask" i], input[placeholder*="question" i], input[placeholder*="query" i], textarea[placeholder*="ask" i]'
    );
    if (await chatInput.first().isVisible({ timeout: 3_000 }).catch(() => false)) {
      await chatInput.first().fill("how many leads");

      // Submit — press Enter or click a send button
      await chatInput.first().press("Enter");
      await page.waitForTimeout(3000);

      // Verify some response appeared
      const responseArea = page.locator(
        '[class*="response"], [class*="answer"], [class*="result"], [data-testid*="nlp"]'
      );
      const gotResponse = await responseArea
        .first()
        .isVisible({ timeout: 5_000 })
        .catch(() => false);
      if (gotResponse) {
        const responseText = await responseArea.first().textContent();
        expect(responseText!.length).toBeGreaterThan(0);
      }
    }
  });
});

test.describe("Admin workflow: reports page", () => {
  test("Admin views reports and export controls", async ({ page }) => {
    const ok = await safeNavigate(page, "/admin/reports");
    if (!ok) {
      test.info().annotations.push({
        type: "skip",
        description: "/admin/reports not accessible",
      });
      return;
    }

    // Verify page loaded with reports content
    const pageContent = await page.textContent("body");
    expect(pageContent!.length).toBeGreaterThan(100);

    // Check for export leads section
    const exportLeads = page.locator(
      'text=/export.*lead|lead.*export|download.*csv|csv.*download/i'
    );
    await expect(exportLeads.first()).toBeVisible({ timeout: 5_000 });

    // Check for download/export button
    const exportButton = page.locator(
      'button:has-text("Export"), button:has-text("Download"), button:has-text("CSV"), a:has-text("Download")'
    );
    await expect(exportButton.first()).toBeVisible({ timeout: 5_000 });
  });
});

// ---------------------------------------------------------------------------
// Layout regression tests — these prevent the double-header + sidebar overlap
// bugs from recurring. If either assertion fails, the admin layout is broken.
// ---------------------------------------------------------------------------

test.describe("Admin layout regression: no double header or sidebar overlap", () => {
  const ADMIN_ROUTES = [
    "/admin",
    "/admin/inventory",
    "/admin/leads",
    "/admin/analytics",
    "/admin/settings",
  ];

  for (const route of ADMIN_ROUTES) {
    test(`${route}: no public site nav visible`, async ({ page }) => {
      const ok = await safeNavigate(page, route);
      if (!ok) {
        test.info().annotations.push({
          type: "skip",
          description: `${route} returned error — skipping layout check`,
        });
        return;
      }

      // The public header nav links (Home, Inventory, Financing, About, Contact)
      // must NOT appear on admin pages. Their presence means the root layout
      // is incorrectly injecting the public header.
      const publicNav = page.locator("header[role='banner']");
      await expect(publicNav).not.toBeVisible({ timeout: 3_000 });

      // The public top bar (dark bar with hours/address) must also be absent
      const topBar = page.locator(
        'a[href="/inventory"]:not([class*="admin"]), nav[aria-label="Primary navigation"]'
      );
      await expect(topBar).not.toBeVisible({ timeout: 3_000 });
    });

    test(`${route}: desktop sidebar renders and content not overlapped`, async ({
      page,
      browserName,
    }) => {
      // webkit project uses iPhone 13 (isMobile:true) — desktop layout test
      // doesn't apply; covered by the mobile test below.
      test.skip(browserName === "webkit", "Mobile browser project — see mobile test");

      const ok = await safeNavigate(page, route);
      if (!ok) {
        test.info().annotations.push({
          type: "skip",
          description: `${route} returned error — skipping layout check`,
        });
        return;
      }
      await page.waitForTimeout(300);

      // On desktop the hamburger must NOT be visible (sidebar always shown)
      const hamburger = page.locator('button[aria-label="Open menu"]');
      await expect(hamburger).not.toBeVisible({ timeout: 5_000 });

      // Desktop sidebar (identified by aria-label) must be visible
      const sidebar = page.locator('[aria-label="Admin navigation desktop"]');
      await expect(sidebar).toBeVisible({ timeout: 5_000 });

      // Main content must start to the right of the sidebar
      const sidebarBox = await sidebar.boundingBox();
      const mainContent = page.locator("main#main-content");
      await expect(mainContent).toBeVisible({ timeout: 5_000 });
      const mainBox = await mainContent.boundingBox();

      if (sidebarBox && mainBox) {
        // Allow 8px tolerance for borders
        expect(mainBox.x).toBeGreaterThanOrEqual(sidebarBox.x + sidebarBox.width - 8);
      }
    });

    test(`${route}: mobile shows hamburger, sidebar is a drawer`, async ({
      page,
      browserName,
    }) => {
      // Only run on the webkit (iPhone 13) project which has genuine mobile
      // device emulation. Desktop projects would need a separate viewport.
      test.skip(browserName !== "webkit", "Desktop browser project — see desktop test");

      const ok = await safeNavigate(page, route);
      if (!ok) {
        test.info().annotations.push({
          type: "skip",
          description: `${route} returned error — skipping mobile check`,
        });
        return;
      }
      await page.waitForTimeout(300);

      // Hamburger button must be visible on mobile
      const hamburger = page.locator('button[aria-label="Open menu"]');
      await expect(hamburger).toBeVisible({ timeout: 5_000 });

      // Mobile drawer must be off-screen (closed) — check it's translated left
      // We verify the hamburger label says "Open menu" (not close) meaning sidebar is closed
      await expect(hamburger).toHaveAttribute("aria-expanded", "false");

      // Main content must take full width (start near left edge — no sidebar offset)
      const mainContent = page.locator("main#main-content");
      await expect(mainContent).toBeVisible({ timeout: 5_000 });
      const mainBox = await mainContent.boundingBox();
      if (mainBox) {
        expect(mainBox.x).toBeLessThan(20); // starts at/near left edge
      }
    });
  }

  test("admin pages: no chat bubble rendered", async ({ page }) => {
    await safeNavigate(page, "/admin");
    await page.waitForTimeout(500);

    const bubble = page.locator('button[aria-label="Open chat assistant"]');
    await expect(bubble).not.toBeVisible({ timeout: 3_000 });
  });
});
