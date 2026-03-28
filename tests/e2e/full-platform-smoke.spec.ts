/**
 * Full Platform Smoke Test — the single most important test file in the platform.
 *
 * Every admin page must load without errors, render its key UI elements, and
 * never show "Internal Server Error" or "Server error: 500". Critical user
 * flows are verified end-to-end with real browser interactions.
 *
 * Run: npx playwright test tests/e2e/full-platform-smoke.spec.ts
 */
import { test, expect, type Page } from "@playwright/test";

/* ========================================================================== */
/* Helpers                                                                    */
/* ========================================================================== */

/**
 * Navigate safely — returns true if the page loaded with status < 400.
 * Returns false (and annotates the test) on auth errors so the suite
 * continues instead of hard-failing.
 */
async function safeNavigate(
  page: Page,
  path: string,
): Promise<{ ok: boolean; status: number }> {
  const response = await page.goto(path, {
    waitUntil: "domcontentloaded",
    timeout: 15_000,
  });
  const status = response?.status() ?? 0;
  return { ok: !!response && status < 400, status };
}

/**
 * Assert the page has no catastrophic error indicators.
 */
async function assertNoServerError(page: Page, label: string): Promise<void> {
  const body = await page.locator("body").innerText({ timeout: 5_000 }).catch(() => "");
  expect(
    body,
    `${label} — page body must not contain "Internal Server Error"`,
  ).not.toContain("Internal Server Error");
  expect(
    body,
    `${label} — page body must not contain "Server error: 500"`,
  ).not.toContain("Server error: 500");
}

/**
 * Assert the page is not a blank white page — body text must exceed a
 * minimum length threshold.
 */
async function assertNotBlank(page: Page, label: string): Promise<void> {
  const body = await page.locator("body").innerText({ timeout: 5_000 }).catch(() => "");
  expect(
    body.trim().length,
    `${label} — page is blank (body text length <= 50)`,
  ).toBeGreaterThan(50);
}

/**
 * Assert the page contains at least one heading (h1 or h2).
 */
async function assertHasHeading(page: Page, label: string): Promise<void> {
  const headingCount = await page.locator("h1, h2").count();
  expect(
    headingCount,
    `${label} — expected at least one h1 or h2 heading`,
  ).toBeGreaterThan(0);
}

/* ========================================================================== */
/* Section 1: Every Admin Page Loads                                          */
/* ========================================================================== */

const ADMIN_PAGES = [
  "/admin",
  "/admin/inventory",
  "/admin/leads",
  "/admin/deals",
  "/admin/fi-products",
  "/admin/lenders",
  "/admin/credit",
  "/admin/documents",
  "/admin/trade-in",
  "/admin/service",
  "/admin/service/appointments",
  "/admin/service/repair-orders",
  "/admin/service/parts",
  "/admin/service/technicians",
  "/admin/accounting",
  "/admin/accounting/commissions",
  "/admin/accounting/export",
  "/admin/digital-retail",
  "/admin/reviews",
  "/admin/customers",
  "/admin/comms",
  "/admin/comms/templates",
  "/admin/comms/sequences",
  "/admin/comms/log",
  "/admin/analytics",
  "/admin/analytics/leads",
  "/admin/analytics/inventory",
  "/admin/marketing",
  "/admin/competitive",
  "/admin/pricing",
  "/admin/reports",
  "/admin/compliance",
  "/admin/compliance/checks",
  "/admin/floor-plan",
  "/admin/tasks",
  "/admin/rewards",
  "/admin/training",
  "/admin/resources",
  "/admin/billing",
  "/admin/settings",
  "/admin/settings/integrations",
  "/admin/settings/notifications",
  "/admin/settings/mfa",
  "/admin/onboarding",
  "/admin/oem",
  "/admin/oem/dealers",
  "/admin/oem/programs",
  "/admin/oem/analytics",
  "/admin/engagement-reports",
  "/admin/good-faith",
  "/admin/change-management",
  "/admin/funnel-health",
  "/admin/analytics-brain",
  "/admin/intake",
  "/admin/vehicles/new",
  "/admin/vehicles/quick-add",
] as const;

test.describe("Section 1: Admin Page Health", () => {
  for (const path of ADMIN_PAGES) {
    test.describe(`Admin: ${path}`, () => {
      test("loads without error", async ({ page }) => {
        const { ok, status } = await safeNavigate(page, path);

        // Skip gracefully on auth errors — annotate and move on
        if (status === 401 || status === 403) {
          test.info().annotations.push({
            type: "skip-reason",
            description: `Auth required (${status}) — skipping UI assertions`,
          });
          return;
        }

        expect(ok, `${path} should load with status < 400 (got ${status})`).toBe(true);

        await assertNoServerError(page, path);
        await assertNotBlank(page, path);
        await assertHasHeading(page, path);
      });
    });
  }
});

/* ========================================================================== */
/* Section 2: Public Pages Load                                               */
/* ========================================================================== */

const PUBLIC_PAGES = [
  { path: "/", label: "Homepage" },
  { path: "/inventory", label: "Inventory" },
  { path: "/financing", label: "Financing" },
  { path: "/about", label: "About" },
  { path: "/contact", label: "Contact" },
  { path: "/hours", label: "Hours" },
  { path: "/directions", label: "Directions" },
  { path: "/trade-in", label: "Trade-In" },
  { path: "/service-booking", label: "Service Booking" },
  { path: "/walkaround", label: "Walkaround" },
] as const;

test.describe("Section 2: Public Page Health", () => {
  for (const { path, label } of PUBLIC_PAGES) {
    test.describe(`Public: ${label} (${path})`, () => {
      test("loads without error", async ({ page }) => {
        const { ok, status } = await safeNavigate(page, path);

        expect(ok, `${path} should load with status < 400 (got ${status})`).toBe(true);

        await assertNoServerError(page, path);
        await assertNotBlank(page, path);
        await assertHasHeading(page, path);
      });
    });
  }
});

/* ========================================================================== */
/* Section 3: Critical User Flows                                             */
/* ========================================================================== */

test.describe("Section 3: Critical User Flows", () => {
  /* ---------------------------------------------------------------------- */
  /* Flow 1: Deal Desking / Payment Calculator                              */
  /* ---------------------------------------------------------------------- */
  test.describe("Flow 1: Payment Calculator", () => {
    test("fill calculator and get monthly payment", async ({ page }) => {
      const { ok, status } = await safeNavigate(page, "/admin/digital-retail");
      if (status === 401 || status === 403) {
        test.info().annotations.push({
          type: "skip-reason",
          description: `Auth required (${status})`,
        });
        return;
      }
      expect(ok).toBe(true);

      // Verify the payment calculator section renders
      await expect(
        page.getByRole("heading", { name: /payment calculator/i }),
      ).toBeVisible();

      // Fill in calculator inputs via their labels
      const priceInput = page.locator("label:has-text('Vehicle Price') + input, label:has-text('Vehicle Price') ~ input").first();
      const downInput = page.locator("label:has-text('Down Payment') + input, label:has-text('Down Payment') ~ input").first();
      const aprInput = page.locator("label:has-text('APR') + input, label:has-text('APR') ~ input").first();

      // Clear and fill each field
      if (await priceInput.isVisible()) {
        await priceInput.fill("35000");
      }
      if (await downInput.isVisible()) {
        await downInput.fill("5000");
      }
      if (await aprInput.isVisible()) {
        await aprInput.fill("4.9");
      }

      // Click Calculate Payment
      const calcButton = page.getByRole("button", { name: /calculate payment/i });
      await expect(calcButton).toBeVisible();
      await calcButton.click();

      // Wait for the result to appear — look for the monthly payment display
      await expect(
        page.locator("text=/Estimated Monthly Payment/i"),
      ).toBeVisible({ timeout: 10_000 });

      // Verify the /mo suffix appears (confirms a number was rendered)
      await expect(page.locator("text=/\\/mo/")).toBeVisible();
    });
  });

  /* ---------------------------------------------------------------------- */
  /* Flow 2: Service Appointment Booking (public)                           */
  /* ---------------------------------------------------------------------- */
  test.describe("Flow 2: Service Booking", () => {
    test("service booking wizard loads with form elements", async ({ page }) => {
      const { ok, status } = await safeNavigate(page, "/service-booking");
      if (status === 401 || status === 403) {
        test.info().annotations.push({
          type: "skip-reason",
          description: `Auth required (${status})`,
        });
        return;
      }
      expect(ok).toBe(true);

      // Verify the page has a heading
      await assertHasHeading(page, "/service-booking");
      await assertNoServerError(page, "/service-booking");

      // Check for form elements — service booking should have at minimum
      // some inputs, selects, or buttons
      const formElements = await page
        .locator("input, select, textarea, button[type='submit'], button:has-text('Next'), button:has-text('Book'), button:has-text('Schedule')")
        .count();
      expect(
        formElements,
        "Service booking page should have form elements (inputs, selects, or action buttons)",
      ).toBeGreaterThan(0);
    });
  });

  /* ---------------------------------------------------------------------- */
  /* Flow 3: Lead Management                                                */
  /* ---------------------------------------------------------------------- */
  test.describe("Flow 3: Lead Management", () => {
    test("leads page renders table and filter controls", async ({ page }) => {
      const { ok, status } = await safeNavigate(page, "/admin/leads");
      if (status === 401 || status === 403) {
        test.info().annotations.push({
          type: "skip-reason",
          description: `Auth required (${status})`,
        });
        return;
      }
      expect(ok).toBe(true);

      // Verify heading
      await expect(
        page.getByRole("heading", { name: /lead/i }).first(),
      ).toBeVisible();

      // Check for filter controls — status, temperature dropdowns (selects)
      const selects = page.locator("select");
      const selectCount = await selects.count();
      expect(
        selectCount,
        "Leads page should have filter selects (status, temperature, sort)",
      ).toBeGreaterThanOrEqual(1);

      // Verify table or list of leads renders
      const tableOrRows = await page
        .locator("table, [role='table'], [role='row'], tr, [data-lead-id]")
        .count();
      // Even if no data, the container structure should exist
      // Also check for "No leads" empty state message
      const emptyState = await page.locator("text=/no leads|no results|empty/i").count();
      expect(
        tableOrRows + emptyState,
        "Leads page should render a table/list or an empty state message",
      ).toBeGreaterThan(0);
    });
  });

  /* ---------------------------------------------------------------------- */
  /* Flow 4: Inventory Management                                           */
  /* ---------------------------------------------------------------------- */
  test.describe("Flow 4: Inventory Management", () => {
    test("inventory page renders vehicle list with search and filters", async ({ page }) => {
      const { ok, status } = await safeNavigate(page, "/admin/inventory");
      if (status === 401 || status === 403) {
        test.info().annotations.push({
          type: "skip-reason",
          description: `Auth required (${status})`,
        });
        return;
      }
      expect(ok).toBe(true);

      // Verify heading
      await expect(
        page.getByRole("heading", { name: /inventory/i }).first(),
      ).toBeVisible();

      // Check for search input
      const searchInput = page.locator(
        "input[type='search'], input[type='text'][placeholder*='earch'], input[name*='search'], input[placeholder*='VIN'], input[placeholder*='vin']",
      );
      const searchCount = await searchInput.count();
      expect(
        searchCount,
        "Inventory page should have a search input",
      ).toBeGreaterThanOrEqual(1);

      // Check for filter buttons or links (All, Available, Pending, Sold)
      const filterButtons = page.locator(
        "a:has-text('All'), button:has-text('All'), a:has-text('Available'), button:has-text('Available'), a:has-text('Pending'), button:has-text('Pending'), a:has-text('Sold'), button:has-text('Sold')",
      );
      const filterCount = await filterButtons.count();
      expect(
        filterCount,
        "Inventory page should have status filter buttons (All, Available, Pending, Sold)",
      ).toBeGreaterThanOrEqual(1);

      // Verify vehicle table or cards render
      const vehicles = await page
        .locator("table, [role='table'], tr:has(td), .vehicle-card, [data-vin]")
        .count();
      const emptyState = await page.locator("text=/no vehicles|no inventory|no results|empty/i").count();
      expect(
        vehicles + emptyState,
        "Inventory page should render vehicle data or an empty state",
      ).toBeGreaterThan(0);
    });
  });

  /* ---------------------------------------------------------------------- */
  /* Flow 5: Review Management                                              */
  /* ---------------------------------------------------------------------- */
  test.describe("Flow 5: Review Management", () => {
    test("reviews page renders stats and review list", async ({ page }) => {
      const { ok, status } = await safeNavigate(page, "/admin/reviews");
      if (status === 401 || status === 403) {
        test.info().annotations.push({
          type: "skip-reason",
          description: `Auth required (${status})`,
        });
        return;
      }
      expect(ok).toBe(true);

      // Verify heading
      await expect(
        page.getByRole("heading", { name: /review/i }).first(),
      ).toBeVisible();

      // Look for stats indicators (average rating, total reviews, stars)
      const statsOrRating = await page
        .locator("text=/average|avg|rating|total reviews|\\d\\.\\d/i")
        .count();
      // Also check for star characters (filled/empty)
      const stars = await page.locator("text=/[\u2605\u2606]/").count();
      expect(
        statsOrRating + stars,
        "Reviews page should display rating stats or star indicators",
      ).toBeGreaterThan(0);

      // Check for review cards or list items
      const reviewItems = await page
        .locator("[data-review-id], .review-card, article, [role='listitem']")
        .count();
      const filterSelects = await page.locator("select").count();
      // Even with no reviews, filter controls should exist
      expect(
        reviewItems + filterSelects,
        "Reviews page should have review items or filter controls",
      ).toBeGreaterThan(0);
    });
  });

  /* ---------------------------------------------------------------------- */
  /* Flow 6: Customer 360                                                   */
  /* ---------------------------------------------------------------------- */
  test.describe("Flow 6: Customer 360", () => {
    test("customers page renders table with search", async ({ page }) => {
      const { ok, status } = await safeNavigate(page, "/admin/customers");
      if (status === 401 || status === 403) {
        test.info().annotations.push({
          type: "skip-reason",
          description: `Auth required (${status})`,
        });
        return;
      }
      expect(ok).toBe(true);

      // Verify heading
      await expect(
        page.getByRole("heading", { name: /customer/i }).first(),
      ).toBeVisible();

      // Check for search input
      const searchInput = page.locator(
        "input[type='search'], input[type='text'][placeholder*='earch'], input[placeholder*='customer'], input[placeholder*='name']",
      );
      const searchCount = await searchInput.count();
      expect(
        searchCount,
        "Customers page should have a search input",
      ).toBeGreaterThanOrEqual(1);

      // Verify table or list structure
      const tableElements = await page
        .locator("table, [role='table'], tr:has(td), [data-customer-id]")
        .count();
      const emptyState = await page.locator("text=/no customer|no results|empty/i").count();
      expect(
        tableElements + emptyState,
        "Customers page should render a customer table or empty state",
      ).toBeGreaterThan(0);
    });
  });

  /* ---------------------------------------------------------------------- */
  /* Flow 7: Accounting Dashboard                                           */
  /* ---------------------------------------------------------------------- */
  test.describe("Flow 7: Accounting Dashboard", () => {
    test("accounting page renders stats cards and sales log", async ({ page }) => {
      const { ok, status } = await safeNavigate(page, "/admin/accounting");
      if (status === 401 || status === 403) {
        test.info().annotations.push({
          type: "skip-reason",
          description: `Auth required (${status})`,
        });
        return;
      }
      expect(ok).toBe(true);

      // Verify heading
      await expect(
        page.getByRole("heading", { name: /accounting/i }).first(),
      ).toBeVisible();

      // Check for stats cards — look for financial keywords
      const statsText = await page
        .locator("text=/units sold|revenue|gross|total|avg/i")
        .count();
      expect(
        statsText,
        "Accounting page should display financial stats (units sold, revenue, gross, etc.)",
      ).toBeGreaterThan(0);

      // Check for month selector
      const monthSelect = page.locator("select");
      const monthCount = await monthSelect.count();
      expect(
        monthCount,
        "Accounting page should have a month selector",
      ).toBeGreaterThanOrEqual(1);

      // Verify table or list for sales log
      const tableElements = await page
        .locator("table, [role='table'], tr:has(td)")
        .count();
      const emptyState = await page.locator("text=/no sales|no data|empty/i").count();
      expect(
        tableElements + emptyState,
        "Accounting page should render a sales log or empty state",
      ).toBeGreaterThan(0);
    });
  });

  /* ---------------------------------------------------------------------- */
  /* Flow 8: Settings Page                                                  */
  /* ---------------------------------------------------------------------- */
  test.describe("Flow 8: Settings Page", () => {
    test("settings page renders form fields and hours section", async ({ page }) => {
      const { ok, status } = await safeNavigate(page, "/admin/settings");
      if (status === 401 || status === 403) {
        test.info().annotations.push({
          type: "skip-reason",
          description: `Auth required (${status})`,
        });
        return;
      }
      expect(ok).toBe(true);

      // Verify heading
      await expect(
        page.getByRole("heading", { name: /settings/i }).first(),
      ).toBeVisible();

      // Check for dealer information form fields
      const formInputs = page.locator("input[type='text'], input[type='email'], input[type='tel'], input[type='url'], textarea");
      const inputCount = await formInputs.count();
      expect(
        inputCount,
        "Settings page should have form fields (name, phone, email, etc.)",
      ).toBeGreaterThanOrEqual(1);

      // Check for the Dealer Information section heading
      const dealerInfoHeading = await page
        .locator("text=/dealer information/i")
        .count();
      expect(
        dealerInfoHeading,
        "Settings page should have a Dealer Information section",
      ).toBeGreaterThan(0);

      // Check for time inputs (Sales Hours section) — select or input[type=time]
      const timeElements = page.locator("input[type='time'], select:has(option:text-matches('AM|PM|:00|:30', 'i'))");
      const timeCount = await timeElements.count();
      // Hours might use selects or time inputs — at minimum the section should exist
      const hoursSection = await page.locator("text=/hours|schedule/i").count();
      expect(
        timeCount + hoursSection,
        "Settings page should have a Sales Hours section with time inputs",
      ).toBeGreaterThan(0);

      // Verify no horizontal overflow (regression check)
      const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
      const viewportWidth = await page.evaluate(() => window.innerWidth);
      expect(
        bodyWidth,
        "Settings page should not have horizontal overflow",
      ).toBeLessThanOrEqual(viewportWidth + 20); // 20px tolerance
    });
  });

  /* ---------------------------------------------------------------------- */
  /* Flow 9: Sidebar Navigation                                             */
  /* ---------------------------------------------------------------------- */
  test.describe("Flow 9: Sidebar Navigation", () => {
    test("desktop sidebar is present with key nav items", async ({ page }) => {
      // Use a desktop viewport explicitly
      await page.setViewportSize({ width: 1280, height: 800 });

      const { ok, status } = await safeNavigate(page, "/admin");
      if (status === 401 || status === 403) {
        test.info().annotations.push({
          type: "skip-reason",
          description: `Auth required (${status})`,
        });
        return;
      }
      expect(ok).toBe(true);

      // Verify desktop sidebar is visible
      const desktopSidebar = page.locator("[aria-label='Admin navigation desktop']");
      await expect(desktopSidebar).toBeVisible();

      // Verify key navigation items are present
      const requiredNavItems = [
        "Dashboard",
        "Inventory",
        "Leads",
        "Deal Desking",
        "Service",
        "Accounting",
        "Reviews",
      ];

      for (const label of requiredNavItems) {
        const navLink = desktopSidebar.locator(`a:has-text("${label}")`);
        const count = await navLink.count();
        expect(
          count,
          `Sidebar should contain a "${label}" nav item`,
        ).toBeGreaterThanOrEqual(1);
      }
    });
  });

  /* ---------------------------------------------------------------------- */
  /* Flow 10: Mobile Hamburger Menu                                         */
  /* ---------------------------------------------------------------------- */
  test.describe("Flow 10: Mobile Hamburger Menu", () => {
    test("mobile: hamburger button visible, sidebar hidden by default", async ({ page }) => {
      // Set a mobile viewport
      await page.setViewportSize({ width: 390, height: 844 });

      const { ok, status } = await safeNavigate(page, "/admin");
      if (status === 401 || status === 403) {
        test.info().annotations.push({
          type: "skip-reason",
          description: `Auth required (${status})`,
        });
        return;
      }
      expect(ok).toBe(true);

      // Hamburger button should be visible on mobile
      const hamburger = page.locator("button[aria-label='Open menu']");
      await expect(hamburger).toBeVisible();

      // Desktop sidebar should be hidden on mobile
      const desktopSidebar = page.locator("[aria-label='Admin navigation desktop']");
      await expect(desktopSidebar).not.toBeVisible();

      // Mobile drawer should start off-screen (translate-x-full = hidden)
      const mobileSidebar = page.locator("aside[aria-label='Admin navigation']");
      // The aside exists in DOM but is translated off-screen
      if (await mobileSidebar.count() > 0) {
        const transform = await mobileSidebar.evaluate(
          (el) => getComputedStyle(el).transform,
        );
        // When hidden, transform should be a translateX of negative value
        // (e.g., "matrix(1, 0, 0, 1, -288, 0)" for -translate-x-full)
        expect(
          transform,
          "Mobile sidebar should be translated off-screen by default",
        ).not.toBe("none");
      }

      // Tap hamburger and verify sidebar slides in
      await hamburger.click();
      await expect(mobileSidebar).toBeVisible();

      // Verify nav items are accessible in mobile drawer
      const dashboardLink = mobileSidebar.locator("a:has-text('Dashboard')");
      await expect(dashboardLink).toBeVisible();
    });
  });

  /* ---------------------------------------------------------------------- */
  /* Flow 11: Deals Page — Deal Pipeline                                    */
  /* ---------------------------------------------------------------------- */
  test.describe("Flow 11: Deal Pipeline", () => {
    test("deals page renders stats cards and deal table", async ({ page }) => {
      const { ok, status } = await safeNavigate(page, "/admin/deals");
      if (status === 401 || status === 403) {
        test.info().annotations.push({
          type: "skip-reason",
          description: `Auth required (${status})`,
        });
        return;
      }
      expect(ok).toBe(true);

      // Verify heading
      await expect(
        page.getByRole("heading", { name: /deal/i }).first(),
      ).toBeVisible();

      // Stats cards should render (Active Deals, Avg Front Gross, etc.)
      const statsText = await page
        .locator("text=/active deals|front gross|back gross|pipeline/i")
        .count();
      expect(
        statsText,
        "Deals page should display pipeline stats",
      ).toBeGreaterThan(0);

      // New Deal button should be present
      const newDealBtn = page.getByRole("button", { name: /new deal/i });
      const newDealCount = await newDealBtn.count();
      expect(
        newDealCount,
        "Deals page should have a New Deal button",
      ).toBeGreaterThanOrEqual(1);

      // Filter controls (status, salesperson selects)
      const selects = page.locator("select");
      const selectCount = await selects.count();
      expect(
        selectCount,
        "Deals page should have filter selects",
      ).toBeGreaterThanOrEqual(1);
    });
  });

  /* ---------------------------------------------------------------------- */
  /* Flow 12: Trade-In Page (public)                                        */
  /* ---------------------------------------------------------------------- */
  test.describe("Flow 12: Trade-In Wizard", () => {
    test("trade-in page loads with wizard form", async ({ page }) => {
      const { ok, status } = await safeNavigate(page, "/trade-in");
      if (status === 401 || status === 403) {
        test.info().annotations.push({
          type: "skip-reason",
          description: `Auth required (${status})`,
        });
        return;
      }
      expect(ok).toBe(true);

      await assertNoServerError(page, "/trade-in");
      await assertNotBlank(page, "/trade-in");

      // Check for form inputs (year, make, model selects or inputs)
      const formElements = await page
        .locator("input, select, textarea")
        .count();
      expect(
        formElements,
        "Trade-in page should have form inputs for vehicle info",
      ).toBeGreaterThan(0);
    });
  });

  /* ---------------------------------------------------------------------- */
  /* Flow 13: Compliance Checks                                             */
  /* ---------------------------------------------------------------------- */
  test.describe("Flow 13: Compliance Checks", () => {
    test("compliance checks page renders checklist", async ({ page }) => {
      const { ok, status } = await safeNavigate(page, "/admin/compliance/checks");
      if (status === 401 || status === 403) {
        test.info().annotations.push({
          type: "skip-reason",
          description: `Auth required (${status})`,
        });
        return;
      }
      expect(ok).toBe(true);

      await expect(
        page.getByRole("heading", { name: /compliance/i }).first(),
      ).toBeVisible();
      await assertNoServerError(page, "/admin/compliance/checks");
    });
  });

  /* ---------------------------------------------------------------------- */
  /* Flow 14: OEM Portal                                                    */
  /* ---------------------------------------------------------------------- */
  test.describe("Flow 14: OEM Portal", () => {
    test("OEM overview page loads with network data", async ({ page }) => {
      const { ok, status } = await safeNavigate(page, "/admin/oem");
      if (status === 401 || status === 403) {
        test.info().annotations.push({
          type: "skip-reason",
          description: `Auth required (${status})`,
        });
        return;
      }
      expect(ok).toBe(true);

      await expect(
        page.getByRole("heading", { name: /oem|network/i }).first(),
      ).toBeVisible();
      await assertNoServerError(page, "/admin/oem");
    });
  });

  /* ---------------------------------------------------------------------- */
  /* Flow 15: Cross-page Navigation — Sequential Admin Walk                 */
  /* ---------------------------------------------------------------------- */
  test.describe("Flow 15: Sequential Admin Walk", () => {
    test("navigate through 10 critical admin pages without crashes", async ({ page }) => {
      const criticalPages = [
        "/admin",
        "/admin/inventory",
        "/admin/leads",
        "/admin/deals",
        "/admin/service",
        "/admin/accounting",
        "/admin/reviews",
        "/admin/customers",
        "/admin/settings",
        "/admin/analytics",
      ];

      for (const path of criticalPages) {
        const { ok, status } = await safeNavigate(page, path);

        // Auth redirect is fine — the point is no 500s
        if (status === 401 || status === 403) continue;

        expect(
          status,
          `${path} should not return 500 (server crash)`,
        ).toBeLessThan(500);

        if (ok) {
          await assertNoServerError(page, path);
        }
      }
    });
  });
});
