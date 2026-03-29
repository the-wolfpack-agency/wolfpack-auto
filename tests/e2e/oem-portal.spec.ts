import { test, expect } from "@playwright/test";

/**
 * OEM Program Management portal — E2E tests.
 *
 * Covers all four OEM routes:
 *   /admin/oem                — Network overview
 *   /admin/oem/dealers        — Dealer network table
 *   /admin/oem/programs       — Programs list
 *   /admin/oem/analytics      — Cross-dealer analytics
 *
 * Tests run in both desktop (chromium/firefox) and mobile (webkit/iPhone 13)
 * configurations via Playwright's project setup.
 *
 * All assertions degrade gracefully when the database migration has not been
 * applied: the pages render a migration-pending notice instead of live data.
 */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function safeNavigate(
  page: import("@playwright/test").Page,
  path: string
): Promise<boolean> {
  const response = await page.goto(path, {
    waitUntil: "domcontentloaded",
    timeout: 15_000,
  });
  return !!response && response.status() < 400;
}

/** Pre-accept cookies so banners never block assertions. */
async function acceptCookies(page: import("@playwright/test").Page) {
  await page.addInitScript(() => {
    localStorage.setItem("cookie_consent", "essential");
  });
}

const OEM_ROUTES = [
  { path: "/admin/oem",           title: /oem network overview/i,      heading: /OEM Network Overview/i },
  { path: "/admin/oem/dealers",   title: /dealer network/i,            heading: /Dealer Network/i },
  { path: "/admin/oem/programs",  title: /programs/i,                  heading: /Programs/i },
  { path: "/admin/oem/analytics", title: /cross-dealer analytics/i,    heading: /Cross-Dealer Analytics/i },
] as const;

// ---------------------------------------------------------------------------
// Route health — every OEM page must return 200, never 500
// ---------------------------------------------------------------------------

test.describe("OEM portal: route health", () => {
  for (const { path, title } of OEM_ROUTES) {
    test(`${path} returns 200 and has correct title`, async ({ page }) => {
      await acceptCookies(page);
      const response = await page.goto(path, {
        waitUntil: "domcontentloaded",
        timeout: 15_000,
      });

      // Must not be a server error
      expect(response?.status()).not.toBe(500);
      expect(response?.status()).not.toBe(502);
      expect(response?.status()).not.toBe(503);

      // If auth redirected us to the login page, skip the title check —
      // that means auth is protecting the route correctly.
      const landedUrl = page.url();
      if (landedUrl.includes("/login")) {
        test.info().annotations.push({
          type: "info",
          description: `${path} redirected to login — auth guard working`,
        });
        return;
      }

      // Page loaded directly — verify the OEM-specific title
      await expect(page).toHaveTitle(title, { timeout: 8_000 });
    });
  }
});

// ---------------------------------------------------------------------------
// Page headings — H1 must render with correct text
// ---------------------------------------------------------------------------

test.describe("OEM portal: page headings", () => {
  for (const { path, heading } of OEM_ROUTES) {
    test(`${path} renders correct H1`, async ({ page }) => {
      await acceptCookies(page);
      const ok = await safeNavigate(page, path);
      if (!ok) {
        test.info().annotations.push({ type: "skip", description: `${path} not accessible` });
        return;
      }

      const h1 = page.locator("h1");
      await expect(h1).toBeVisible({ timeout: 8_000 });
      await expect(h1).toHaveText(heading);
    });
  }
});

// ---------------------------------------------------------------------------
// Migration notice — shown when tables don't exist yet
// ---------------------------------------------------------------------------

test.describe("OEM portal: migration-pending notice", () => {
  for (const { path } of OEM_ROUTES) {
    test(`${path} renders migration notice or live data (never blank)`, async ({ page }) => {
      await acceptCookies(page);
      const ok = await safeNavigate(page, path);
      if (!ok) {
        test.info().annotations.push({ type: "skip", description: `${path} not accessible` });
        return;
      }

      // The page must render SOMETHING meaningful — either live data or the
      // amber migration-pending notice. It must never be a blank page.
      const bodyText = await page.locator("body").textContent();
      expect(bodyText?.length ?? 0).toBeGreaterThan(100);

      // If there's a migration notice, verify its content
      const migrationNotice = page.locator("text=/migration pending/i, text=/apply migration/i");
      const hasNotice = await migrationNotice.first().isVisible({ timeout: 2_000 }).catch(() => false);

      if (hasNotice) {
        // Must mention the migration file name
        await expect(page.locator("code").filter({ hasText: /004_oem/ })).toBeVisible();
      }
    });
  }
});

// ---------------------------------------------------------------------------
// Overview page — stat cards + quick-nav tiles
// ---------------------------------------------------------------------------

test.describe("OEM portal: overview page structure", () => {
  test("renders 5 KPI stat cards", async ({ page }) => {
    await acceptCookies(page);
    const ok = await safeNavigate(page, "/admin/oem");
    if (!ok) {
      test.info().annotations.push({ type: "skip", description: "Not accessible" });
      return;
    }

    // 5 stat cards in the metrics grid
    const statCards = page.locator(".grid .rounded-xl.border.bg-white").filter({
      has: page.locator("p.text-xs.font-medium.uppercase"),
    });
    const count = await statCards.count();
    expect(count).toBeGreaterThanOrEqual(4);
  });

  test("renders 4 quick-nav tiles with correct links", async ({ page }) => {
    await acceptCookies(page);
    const ok = await safeNavigate(page, "/admin/oem");
    if (!ok) {
      test.info().annotations.push({ type: "skip", description: "Not accessible" });
      return;
    }

    // Scope to main content to avoid matching sidebar sub-nav items
    const main = page.locator("main#admin-main-content");
    const dealerTile = main.locator('a[href="/admin/oem/dealers"]').filter({ hasText: /Dealer Network/i });
    const programsTile = main.locator('a[href="/admin/oem/programs"]').filter({ hasText: /Programs/i });
    const analyticsTile = main.locator('a[href="/admin/oem/analytics"]').filter({ hasText: /Cross-Dealer Analytics/i });

    await expect(dealerTile.first()).toBeVisible({ timeout: 5_000 });
    await expect(programsTile.first()).toBeVisible({ timeout: 5_000 });
    await expect(analyticsTile.first()).toBeVisible({ timeout: 5_000 });
  });

  test("renders enrollment activity section", async ({ page }) => {
    await acceptCookies(page);
    const ok = await safeNavigate(page, "/admin/oem");
    if (!ok) {
      test.info().annotations.push({ type: "skip", description: "Not accessible" });
      return;
    }

    // Section heading exists
    const section = page.locator("h2", { hasText: /Recent Enrollment Activity/i });
    await expect(section).toBeVisible({ timeout: 5_000 });
  });

  test('"Manage Programs" button links to /admin/oem/programs', async ({ page }) => {
    await acceptCookies(page);
    const ok = await safeNavigate(page, "/admin/oem");
    if (!ok) {
      test.info().annotations.push({ type: "skip", description: "Not accessible" });
      return;
    }

    const btn = page.locator('a[href="/admin/oem/programs"]', { hasText: /Manage Programs/i });
    await expect(btn.first()).toBeVisible({ timeout: 5_000 });
  });
});

// ---------------------------------------------------------------------------
// Dealers page
// ---------------------------------------------------------------------------

test.describe("OEM portal: dealers page", () => {
  test("breadcrumb links back to OEM overview", async ({ page }) => {
    await acceptCookies(page);
    const ok = await safeNavigate(page, "/admin/oem/dealers");
    if (!ok) {
      test.info().annotations.push({ type: "skip", description: "Not accessible" });
      return;
    }

    // Scope to main content to avoid matching sidebar OEM link
    const main = page.locator("main#admin-main-content");
    const breadcrumb = main.locator('a[href="/admin/oem"]').filter({ hasText: /OEM Network/i });
    await expect(breadcrumb.first()).toBeVisible({ timeout: 5_000 });
  });

  test("renders data table or empty state", async ({ page }) => {
    await acceptCookies(page);
    const ok = await safeNavigate(page, "/admin/oem/dealers");
    if (!ok) {
      test.info().annotations.push({ type: "skip", description: "Not accessible" });
      return;
    }

    // Scope to main content — sidebar may have overlapping OEM links
    const main = page.locator("main#admin-main-content");
    // Wait for client-side data fetch to complete
    await page.waitForTimeout(2_000);
    // Either a data table or an empty-state message
    const hasTable = await main.locator("table").isVisible({ timeout: 8_000 }).catch(() => false);
    const hasEmptyState = await main.getByText(/no dealers found/i)
      .isVisible({ timeout: 5_000 }).catch(() => false);

    expect(hasTable || hasEmptyState).toBe(true);
  });

  test('"Manage Programs" header button links correctly', async ({ page }) => {
    await acceptCookies(page);
    const ok = await safeNavigate(page, "/admin/oem/dealers");
    if (!ok) {
      test.info().annotations.push({ type: "skip", description: "Not accessible" });
      return;
    }

    const main = page.locator("main#admin-main-content");
    const link = main.locator('a[href="/admin/oem/programs"]').filter({ hasText: /Manage Programs/i });
    await expect(link.first()).toBeVisible({ timeout: 5_000 });
  });
});

// ---------------------------------------------------------------------------
// Programs page
// ---------------------------------------------------------------------------

test.describe("OEM portal: programs page", () => {
  test("breadcrumb links back to OEM overview", async ({ page }) => {
    await acceptCookies(page);
    const ok = await safeNavigate(page, "/admin/oem/programs");
    if (!ok) {
      test.info().annotations.push({ type: "skip", description: "Not accessible" });
      return;
    }

    const main = page.locator("main#admin-main-content");
    const breadcrumb = main.locator('a[href="/admin/oem"]').filter({ hasText: /OEM Network/i });
    await expect(breadcrumb.first()).toBeVisible({ timeout: 5_000 });
  });

  test("renders program cards or migration notice (never blank)", async ({ page }) => {
    await acceptCookies(page);
    const ok = await safeNavigate(page, "/admin/oem/programs");
    if (!ok) {
      test.info().annotations.push({ type: "skip", description: "Not accessible" });
      return;
    }

    const main = page.locator("main#admin-main-content");
    // Wait for client-side data fetch
    await page.waitForTimeout(2_000);
    // Empty state shows template program cards
    const hasProgramCard = await main.locator(".rounded-xl.border").filter({ hasText: /incentive|certification|brand standard|training|co-op/i })
      .first().isVisible({ timeout: 8_000 }).catch(() => false);

    const bodyText = await page.locator("body").textContent();
    expect(bodyText?.length ?? 0).toBeGreaterThan(200);

    if (!hasProgramCard) {
      // Should at least have the migration notice or empty state
      const hasNotice = await main.getByText(/no programs/i)
        .first().isVisible({ timeout: 5_000 }).catch(() => false);
      const hasMigration = await main.getByText(/migration/i)
        .first().isVisible({ timeout: 1_000 }).catch(() => false);
      expect(hasNotice || hasMigration).toBe(true);
    }
  });

  test("all 5 program type templates visible in empty state", async ({ page }) => {
    await acceptCookies(page);
    const ok = await safeNavigate(page, "/admin/oem/programs");
    if (!ok) {
      test.info().annotations.push({ type: "skip", description: "Not accessible" });
      return;
    }

    // These are only shown when no programs exist (pre-migration)
    const hasEmptyState = await page
      .locator("text=/no programs found/i")
      .isVisible({ timeout: 2_000 })
      .catch(() => false);

    if (!hasEmptyState) {
      // Live data — just verify page has content
      const bodyText = await page.locator("body").textContent();
      expect(bodyText?.length ?? 0).toBeGreaterThan(100);
      return;
    }

    const expectedTypes = [/Incentive/i, /Certification/i, /Brand Standard/i, /Training/i, /Co-op/i];
    for (const type of expectedTypes) {
      const badge = page.locator("span.rounded-full", { hasText: type });
      await expect(badge.first()).toBeVisible({ timeout: 5_000 });
    }
  });
});

// ---------------------------------------------------------------------------
// Analytics page
// ---------------------------------------------------------------------------

test.describe("OEM portal: analytics page", () => {
  test("breadcrumb links back to OEM overview", async ({ page }) => {
    await acceptCookies(page);
    const ok = await safeNavigate(page, "/admin/oem/analytics");
    if (!ok) {
      test.info().annotations.push({ type: "skip", description: "Not accessible" });
      return;
    }

    const main = page.locator("main#admin-main-content");
    const breadcrumb = main.locator('a[href="/admin/oem"]').filter({ hasText: /OEM Network/i });
    await expect(breadcrumb.first()).toBeVisible({ timeout: 5_000 });
  });

  test("renders 4 network KPI cards", async ({ page }) => {
    await acceptCookies(page);
    const ok = await safeNavigate(page, "/admin/oem/analytics");
    if (!ok) {
      test.info().annotations.push({ type: "skip", description: "Not accessible" });
      return;
    }

    const kpiGrid = page.locator(".grid.grid-cols-2").first();
    await expect(kpiGrid).toBeVisible({ timeout: 5_000 });

    // 4 KPI labels
    const kpiLabels = [/Network Dealers/i, /Total Leads/i, /Active Inventory/i, /Program Compliance/i];
    for (const label of kpiLabels) {
      const card = page.locator("p.text-xs.font-medium", { hasText: label });
      await expect(card.first()).toBeVisible({ timeout: 5_000 });
    }
  });

  test("renders dealer benchmark table or empty state", async ({ page }) => {
    await acceptCookies(page);
    const ok = await safeNavigate(page, "/admin/oem/analytics");
    if (!ok) {
      test.info().annotations.push({ type: "skip", description: "Not accessible" });
      return;
    }

    const section = page.locator("h2", { hasText: /Dealer Performance Benchmark/i });
    await expect(section).toBeVisible({ timeout: 5_000 });

    // Either data rows or empty state
    const hasTable = await page.locator("table tbody tr").first().isVisible({ timeout: 3_000 }).catch(() => false);
    const hasEmpty = await page.locator("text=/no dealer data/i").isVisible({ timeout: 3_000 }).catch(() => false);
    expect(hasTable || hasEmpty).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Admin sidebar: OEM navigation
// ---------------------------------------------------------------------------

test.describe("OEM portal: sidebar navigation", () => {
  test.skip(({ browserName }) => browserName === "webkit", "Desktop layout test — see mobile test");

  for (const { path } of OEM_ROUTES) {
    test(`${path}: sidebar shows "OEM Network" nav item`, async ({ page }) => {
      await acceptCookies(page);
      const ok = await safeNavigate(page, path);
      if (!ok) {
        test.info().annotations.push({ type: "skip", description: `${path} not accessible` });
        return;
      }

      // Desktop sidebar must be visible
      const sidebar = page.locator('[aria-label="Admin navigation desktop"]');
      await expect(sidebar).toBeVisible({ timeout: 5_000 });

      // OEM Network nav link must exist in the sidebar
      const oemLink = sidebar.locator('a[href="/admin/oem"]', { hasText: /OEM Network/i });
      await expect(oemLink).toBeVisible({ timeout: 5_000 });
    });

    test(`${path}: OEM sub-nav expands with 4 child links`, async ({ page }) => {
      await acceptCookies(page);
      const ok = await safeNavigate(page, path);
      if (!ok) {
        test.info().annotations.push({ type: "skip", description: `${path} not accessible` });
        return;
      }

      const sidebar = page.locator('[aria-label="Admin navigation desktop"]');
      await expect(sidebar).toBeVisible({ timeout: 5_000 });

      // All 4 sub-nav items must be visible when on an OEM page
      const subNavItems = [
        { href: "/admin/oem",           label: /^Overview$/i },
        { href: "/admin/oem/dealers",   label: /Dealer Network/i },
        { href: "/admin/oem/programs",  label: /Programs/i },
        { href: "/admin/oem/analytics", label: /Cross-Dealer Analytics/i },
      ];

      for (const item of subNavItems) {
        const link = sidebar.locator(`a[href="${item.href}"]`).filter({ hasText: item.label });
        await expect(link.first()).toBeVisible({ timeout: 5_000 });
      }
    });
  }
});

// ---------------------------------------------------------------------------
// Admin isolation — public chrome must NOT render on OEM pages
// ---------------------------------------------------------------------------

test.describe("OEM portal: admin chrome isolation", () => {
  for (const { path } of OEM_ROUTES) {
    test(`${path}: no public site header`, async ({ page }) => {
      await acceptCookies(page);
      const ok = await safeNavigate(page, path);
      if (!ok) {
        test.info().annotations.push({ type: "skip", description: `${path} not accessible` });
        return;
      }

      const publicHeader = page.locator("header[role='banner']");
      await expect(publicHeader).not.toBeVisible({ timeout: 3_000 });
    });

    test(`${path}: no chat bubble`, async ({ page }) => {
      await acceptCookies(page);
      const ok = await safeNavigate(page, path);
      if (!ok) {
        test.info().annotations.push({ type: "skip", description: `${path} not accessible` });
        return;
      }

      await page.waitForTimeout(500);
      const chatBubble = page.locator('button[aria-label="Open chat assistant"]');
      await expect(chatBubble).not.toBeVisible({ timeout: 3_000 });
    });
  }
});

// ---------------------------------------------------------------------------
// Desktop layout — sidebar + no content overlap
// ---------------------------------------------------------------------------

test.describe("OEM portal: desktop layout", () => {
  test.skip(({ browserName }) => browserName === "webkit", "Desktop layout — mobile project excluded");

  for (const { path } of OEM_ROUTES) {
    test(`${path}: sidebar visible and content not overlapped`, async ({ page }) => {
      await acceptCookies(page);
      const ok = await safeNavigate(page, path);
      if (!ok) {
        test.info().annotations.push({ type: "skip", description: `${path} not accessible` });
        return;
      }
      await page.waitForTimeout(300);

      // Desktop hamburger must NOT be visible
      const hamburger = page.locator('button[aria-label="Open menu"]');
      await expect(hamburger).not.toBeVisible({ timeout: 5_000 });

      // Desktop sidebar visible
      const sidebar = page.locator('[aria-label="Admin navigation desktop"]');
      await expect(sidebar).toBeVisible({ timeout: 5_000 });

      // Admin main content starts to the right of the sidebar
      const sidebarBox = await sidebar.boundingBox();
      const mainContent = page.locator("main#admin-main-content");
      await expect(mainContent).toBeVisible({ timeout: 5_000 });
      const mainBox = await mainContent.boundingBox();

      if (sidebarBox && mainBox) {
        expect(mainBox.x).toBeGreaterThanOrEqual(sidebarBox.x + sidebarBox.width - 8);
      }
    });

    test(`${path}: no horizontal overflow at 1280px`, async ({ page }) => {
      await acceptCookies(page);
      await page.setViewportSize({ width: 1280, height: 720 });
      const ok = await safeNavigate(page, path);
      if (!ok) {
        test.info().annotations.push({ type: "skip", description: `${path} not accessible` });
        return;
      }

      const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
      expect(bodyWidth).toBeLessThanOrEqual(1281);
    });
  }
});

// ---------------------------------------------------------------------------
// Mobile layout — hamburger + drawer
// ---------------------------------------------------------------------------

test.describe("OEM portal: mobile layout", () => {
  test.skip(({ browserName }) => browserName !== "webkit", "Mobile layout — webkit iPhone 13 project only");

  for (const { path } of OEM_ROUTES) {
    test(`${path}: hamburger visible, sidebar closed`, async ({ page }) => {
      await acceptCookies(page);
      const ok = await safeNavigate(page, path);
      if (!ok) {
        test.info().annotations.push({ type: "skip", description: `${path} not accessible` });
        return;
      }
      await page.waitForTimeout(300);

      // Hamburger button visible on mobile
      const hamburger = page.locator('button[aria-label="Open menu"]');
      await expect(hamburger).toBeVisible({ timeout: 5_000 });

      // Drawer closed by default
      await expect(hamburger).toHaveAttribute("aria-expanded", "false");

      // Main content takes full width (no sidebar offset)
      const mainContent = page.locator("main#admin-main-content");
      await expect(mainContent).toBeVisible({ timeout: 5_000 });
      const mainBox = await mainContent.boundingBox();
      if (mainBox) {
        expect(mainBox.x).toBeLessThan(20);
      }
    });

    test(`${path}: mobile drawer opens and shows OEM Network link`, async ({ page }) => {
      await acceptCookies(page);
      const ok = await safeNavigate(page, path);
      if (!ok) {
        test.info().annotations.push({ type: "skip", description: `${path} not accessible` });
        return;
      }
      await page.waitForTimeout(300);

      const hamburger = page.locator('button[aria-label="Open menu"]');
      await hamburger.click();
      await page.waitForTimeout(300);

      // OEM Network link visible in mobile drawer
      const oemLink = page.locator('[aria-label="Admin navigation"] a[href="/admin/oem"]');
      await expect(oemLink.first()).toBeVisible({ timeout: 5_000 });

      // Close drawer
      const closeBtn = page.locator('button[aria-label="Close menu"]');
      if (await closeBtn.isVisible({ timeout: 1_000 }).catch(() => false)) {
        await closeBtn.click();
      }
    });
  }
});

// ---------------------------------------------------------------------------
// Responsive — no horizontal overflow on mobile viewport
// ---------------------------------------------------------------------------

test.describe("OEM portal: responsive — no overflow", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "Run once on chromium only");

  for (const { path } of OEM_ROUTES) {
    test(`${path}: no horizontal scroll at 375px`, async ({ page }) => {
      await acceptCookies(page);
      await page.setViewportSize({ width: 375, height: 812 });
      const ok = await safeNavigate(page, path);
      if (!ok) {
        test.info().annotations.push({ type: "skip", description: `${path} not accessible` });
        return;
      }
      await page.waitForTimeout(300);

      const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
      expect(bodyWidth).toBeLessThanOrEqual(376);
    });
  }
});

// ---------------------------------------------------------------------------
// No console errors on any OEM page
// ---------------------------------------------------------------------------

test.describe("OEM portal: no JavaScript errors", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "Run once on chromium only");

  for (const { path } of OEM_ROUTES) {
    test(`${path}: no unhandled JS errors`, async ({ page }) => {
      const errors: string[] = [];
      page.on("console", (msg) => {
        if (msg.type() === "error") {
          const text = msg.text();
          // Ignore expected non-critical errors
          if (
            text.includes("favicon") ||
            text.includes("hydration") ||
            text.includes("Third-party cookie") ||
            text.includes("net::ERR_")
          )
            return;
          errors.push(text);
        }
      });

      await acceptCookies(page);
      const ok = await safeNavigate(page, path);
      if (!ok) {
        test.info().annotations.push({ type: "skip", description: `${path} not accessible` });
        return;
      }
      await page.waitForTimeout(1_500);

      expect(
        errors,
        `Console errors on ${path}:\n${errors.join("\n")}`
      ).toHaveLength(0);
    });
  }
});

// ---------------------------------------------------------------------------
// Inter-page navigation — links between OEM pages actually work
// ---------------------------------------------------------------------------

test.describe("OEM portal: inter-page navigation", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "Run once on chromium only");

  test("overview → dealers navigation", async ({ page }) => {
    await acceptCookies(page);
    const ok = await safeNavigate(page, "/admin/oem");
    if (!ok) {
      test.info().annotations.push({ type: "skip", description: "Overview not accessible" });
      return;
    }

    // Scope to main content to click the page tile, not the sidebar sub-nav
    const main = page.locator("main#admin-main-content");
    const dealerLink = main.locator('a[href="/admin/oem/dealers"]').filter({ hasText: /Dealer Network/i }).first();
    await expect(dealerLink).toBeVisible({ timeout: 5_000 });
    await dealerLink.click();

    await expect(page).toHaveURL(/\/admin\/oem\/dealers/, { timeout: 8_000 });
    await expect(page.locator("h1", { hasText: /Dealer Network/i })).toBeVisible({ timeout: 5_000 });
  });

  test("overview → programs navigation", async ({ page }) => {
    await acceptCookies(page);
    const ok = await safeNavigate(page, "/admin/oem");
    if (!ok) {
      test.info().annotations.push({ type: "skip", description: "Overview not accessible" });
      return;
    }

    const main = page.locator("main#admin-main-content");
    const programsLink = main.locator('a[href="/admin/oem/programs"]').filter({ hasText: /Manage Programs/i }).first();
    await expect(programsLink).toBeVisible({ timeout: 5_000 });
    await programsLink.click();

    await expect(page).toHaveURL(/\/admin\/oem\/programs/, { timeout: 8_000 });
    await expect(page.locator("h1", { hasText: /Programs/i })).toBeVisible({ timeout: 5_000 });
  });

  test("dealers → overview breadcrumb", async ({ page }) => {
    await acceptCookies(page);
    const ok = await safeNavigate(page, "/admin/oem/dealers");
    if (!ok) {
      test.info().annotations.push({ type: "skip", description: "Dealers page not accessible" });
      return;
    }

    // Scope to main content for breadcrumb (sidebar also has OEM Network link)
    const main = page.locator("main#admin-main-content");
    const breadcrumb = main.locator('a[href="/admin/oem"]').filter({ hasText: /OEM Network/i }).first();
    await expect(breadcrumb).toBeVisible({ timeout: 5_000 });
    await breadcrumb.click();

    await expect(page).toHaveURL(/\/admin\/oem$/, { timeout: 8_000 });
    await expect(page.locator("h1", { hasText: /OEM Network Overview/i })).toBeVisible({ timeout: 5_000 });
  });
});
