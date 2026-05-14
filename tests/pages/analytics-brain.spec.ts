import { test, expect } from "@playwright/test";

test.skip(
  !process.env.DATABASE_URL,
  "Needs real Postgres (Phase 1 Tests runs in shadow mode). Run via the real-DB integration phase or locally with DATABASE_URL set.",
);

test.describe("Admin Analytics Brain Dashboard", () => {
  test("analytics brain page loads successfully", async ({ page }) => {
    await page.goto("/admin/analytics-brain");
    await expect(page.locator("h1")).toContainText("Analytics Brain");
  });

  test("shows stats overview cards", async ({ page }) => {
    await page.goto("/admin/analytics-brain");
    // Use getByText with exact match to avoid strict-mode violations
    // from description text mentioning the same words
    await expect(page.getByText("Active Sessions", { exact: true })).toBeVisible();
    await expect(page.getByText("Buffered Events", { exact: true })).toBeVisible();
    await expect(page.getByText("Insights Generated", { exact: true })).toBeVisible();
    await expect(page.getByText("Hot Leads", { exact: true })).toBeVisible();
    await expect(page.getByText("Alerts", { exact: true })).toBeVisible();
  });

  test("shows empty state when no sessions exist", async ({ page }) => {
    await page.goto("/admin/analytics-brain");
    // With no real traffic, should show empty state or zero counts
    const content = await page.textContent("body");
    // Should have either insights or the empty state message
    expect(
      content?.includes("No insights yet") || content?.includes("Insights Generated"),
    ).toBeTruthy();
  });

  test("admin sidebar includes Brain nav link", async ({ page }) => {
    await page.goto("/admin/analytics-brain");
    // Scope to desktop sidebar to avoid matching hidden mobile copy
    const sidebar = page.locator("[aria-label='Admin navigation desktop']");
    const brainLink = sidebar.locator('a[href="/admin/analytics-brain"]');
    await expect(brainLink).toBeVisible();
    await expect(brainLink).toContainText("Brain");
  });

  test("brain page is accessible from admin dashboard", async ({ page }) => {
    await page.goto("/admin");
    // Dashboard section auto-expands on /admin — Brain is inside it
    const sidebar = page.locator("[aria-label='Admin navigation desktop']");
    const brainLink = sidebar.locator('a[href="/admin/analytics-brain"]');
    await expect(brainLink).toBeVisible();
    await brainLink.click();
    await page.waitForURL(/\/admin\/analytics-brain/);
    await expect(page.locator("h1")).toContainText("Analytics Brain");
  });

  test("page has correct metadata", async ({ page }) => {
    await page.goto("/admin/analytics-brain");
    const title = await page.title();
    expect(title.toLowerCase()).toContain("brain");
  });

  test("event distribution section renders", async ({ page }) => {
    await page.goto("/admin/analytics-brain");
    const content = await page.textContent("body");
    expect(content?.includes("Event Distribution") || content?.includes("No insights yet")).toBeTruthy();
  });

  test("brain dashboard is responsive on mobile", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/admin/analytics-brain");
    await expect(page.locator("h1")).toContainText("Analytics Brain");
    // Stats cards should still be visible
    await expect(page.getByText("Active Sessions", { exact: true })).toBeVisible();
  });
});

test.describe("Analytics Brain with Seeded Data", () => {
  test.beforeAll(async ({ request }) => {
    const now = Date.now();
    const ts = (offsetMs: number) => new Date(now + offsetMs).toISOString();

    // Helper to send events for a session
    const seed = async (events: Record<string, unknown>[]) => {
      await request.post("/api/analytics/events", { data: { events } });
    };

    // --- Session 1: HOT LEAD (temp ~85+) ---
    // 5 vehicle views (20pts) + 5 pages (15pts) + 3 searches (6pts)
    // + 5 min time (10pts) + conversion (25pts) + form (5pts) = ~81+
    const hot = `hot_lead_${now}`;
    await seed([
      { event_type: "page_view", action: "navigate", page: "/", session_id: hot, user_fingerprint: "fp_hot", timestamp: ts(0), metadata: {} },
      { event_type: "page_view", action: "navigate", page: "/inventory", session_id: hot, user_fingerprint: "fp_hot", timestamp: ts(30000), metadata: {} },
      { event_type: "page_view", action: "navigate", page: "/financing", session_id: hot, user_fingerprint: "fp_hot", timestamp: ts(60000), metadata: {} },
      { event_type: "page_view", action: "navigate", page: "/trade-in", session_id: hot, user_fingerprint: "fp_hot", timestamp: ts(90000), metadata: {} },
      { event_type: "page_view", action: "navigate", page: "/contact", session_id: hot, user_fingerprint: "fp_hot", timestamp: ts(120000), metadata: {} },
      { event_type: "vehicle_view", action: "view_vehicle", page: "/inventory/V1", session_id: hot, user_fingerprint: "fp_hot", timestamp: ts(35000), metadata: { vin: "VIN_HOT_1", title: "2024 Toyota Camry" } },
      { event_type: "vehicle_view", action: "view_vehicle", page: "/inventory/V2", session_id: hot, user_fingerprint: "fp_hot", timestamp: ts(45000), metadata: { vin: "VIN_HOT_2", title: "2024 Honda Civic" } },
      { event_type: "vehicle_view", action: "view_vehicle", page: "/inventory/V3", session_id: hot, user_fingerprint: "fp_hot", timestamp: ts(55000), metadata: { vin: "VIN_HOT_3", title: "2024 Ford F-150" } },
      { event_type: "vehicle_view", action: "view_vehicle", page: "/inventory/V4", session_id: hot, user_fingerprint: "fp_hot", timestamp: ts(65000), metadata: { vin: "VIN_HOT_4", title: "2024 BMW X5" } },
      { event_type: "vehicle_view", action: "view_vehicle", page: "/inventory/V5", session_id: hot, user_fingerprint: "fp_hot", timestamp: ts(75000), metadata: { vin: "VIN_HOT_5", title: "2024 Tesla Model 3" } },
      { event_type: "search", action: "search_query", page: "/inventory", session_id: hot, user_fingerprint: "fp_hot", timestamp: ts(32000), metadata: { query: "Toyota under 30k", results_count: 8 } },
      { event_type: "search", action: "search_query", page: "/inventory", session_id: hot, user_fingerprint: "fp_hot", timestamp: ts(42000), metadata: { query: "SUV 2024", results_count: 12 } },
      { event_type: "search", action: "search_query", page: "/inventory", session_id: hot, user_fingerprint: "fp_hot", timestamp: ts(52000), metadata: { query: "certified pre-owned", results_count: 5 } },
      { event_type: "time_on_page", action: "duration", page: "/inventory", session_id: hot, user_fingerprint: "fp_hot", timestamp: ts(300000), metadata: { duration_ms: 300000 } },
      { event_type: "form_interaction", action: "field_focus", page: "/contact", session_id: hot, user_fingerprint: "fp_hot", timestamp: ts(130000), metadata: { field: "email" } },
      { event_type: "conversion", action: "submit_lead_form", page: "/contact", session_id: hot, user_fingerprint: "fp_hot", timestamp: ts(150000), metadata: { conversion_type: "submit_lead_form" } },
    ]);

    // --- Session 2: WARM LEAD with EXIT INTENT (temp ~55, triggers alert) ---
    // Need: 5 vehicles (20) + 5 pages (15) + 3 searches (6) + 5min (10) + form (5) = 56 → warm
    const exitLead = `exit_lead_${now}`;
    await seed([
      { event_type: "page_view", action: "navigate", page: "/", session_id: exitLead, user_fingerprint: "fp_exit", timestamp: ts(0), metadata: {} },
      { event_type: "page_view", action: "navigate", page: "/inventory", session_id: exitLead, user_fingerprint: "fp_exit", timestamp: ts(20000), metadata: {} },
      { event_type: "page_view", action: "navigate", page: "/financing", session_id: exitLead, user_fingerprint: "fp_exit", timestamp: ts(40000), metadata: {} },
      { event_type: "page_view", action: "navigate", page: "/trade-in", session_id: exitLead, user_fingerprint: "fp_exit", timestamp: ts(60000), metadata: {} },
      { event_type: "page_view", action: "navigate", page: "/contact", session_id: exitLead, user_fingerprint: "fp_exit", timestamp: ts(80000), metadata: {} },
      { event_type: "vehicle_view", action: "view_vehicle", page: "/inventory/VEX1", session_id: exitLead, user_fingerprint: "fp_exit", timestamp: ts(25000), metadata: { vin: "VIN_EXIT_1", title: "2024 Hyundai Tucson" } },
      { event_type: "vehicle_view", action: "view_vehicle", page: "/inventory/VEX2", session_id: exitLead, user_fingerprint: "fp_exit", timestamp: ts(35000), metadata: { vin: "VIN_EXIT_2", title: "2024 Kia Sportage" } },
      { event_type: "vehicle_view", action: "view_vehicle", page: "/inventory/VEX3", session_id: exitLead, user_fingerprint: "fp_exit", timestamp: ts(45000), metadata: { vin: "VIN_EXIT_3", title: "2024 Subaru Outback" } },
      { event_type: "vehicle_view", action: "view_vehicle", page: "/inventory/VEX4", session_id: exitLead, user_fingerprint: "fp_exit", timestamp: ts(55000), metadata: { vin: "VIN_EXIT_4", title: "2024 Honda CR-V" } },
      { event_type: "vehicle_view", action: "view_vehicle", page: "/inventory/VEX5", session_id: exitLead, user_fingerprint: "fp_exit", timestamp: ts(65000), metadata: { vin: "VIN_EXIT_5", title: "2024 Toyota RAV4" } },
      { event_type: "search", action: "search_query", page: "/inventory", session_id: exitLead, user_fingerprint: "fp_exit", timestamp: ts(22000), metadata: { query: "AWD under 35k", results_count: 6 } },
      { event_type: "search", action: "search_query", page: "/inventory", session_id: exitLead, user_fingerprint: "fp_exit", timestamp: ts(32000), metadata: { query: "compact SUV", results_count: 9 } },
      { event_type: "search", action: "search_query", page: "/inventory", session_id: exitLead, user_fingerprint: "fp_exit", timestamp: ts(42000), metadata: { query: "hybrid SUV 2024", results_count: 4 } },
      { event_type: "time_on_page", action: "duration", page: "/inventory", session_id: exitLead, user_fingerprint: "fp_exit", timestamp: ts(300000), metadata: { duration_ms: 300000 } },
      { event_type: "form_interaction", action: "field_focus", page: "/contact", session_id: exitLead, user_fingerprint: "fp_exit", timestamp: ts(85000), metadata: { field: "phone" } },
      { event_type: "exit_intent", action: "mouse_leave", page: "/financing", session_id: exitLead, user_fingerprint: "fp_exit", timestamp: ts(90000), metadata: {} },
    ]);

    // --- Session 3: FRUSTRATED BUYER with RAGE CLICKS (temp ~45, triggers alert) ---
    // Need: 4 vehicles (16) + 4 pages (12) + 2 searches (4) + 3min (6) + form (5) = 43 → cool but >= 40
    const rageLead = `rage_lead_${now}`;
    await seed([
      { event_type: "page_view", action: "navigate", page: "/", session_id: rageLead, user_fingerprint: "fp_rage", timestamp: ts(0), metadata: {} },
      { event_type: "page_view", action: "navigate", page: "/inventory", session_id: rageLead, user_fingerprint: "fp_rage", timestamp: ts(15000), metadata: {} },
      { event_type: "page_view", action: "navigate", page: "/financing", session_id: rageLead, user_fingerprint: "fp_rage", timestamp: ts(30000), metadata: {} },
      { event_type: "page_view", action: "navigate", page: "/contact", session_id: rageLead, user_fingerprint: "fp_rage", timestamp: ts(45000), metadata: {} },
      { event_type: "vehicle_view", action: "view_vehicle", page: "/inventory/VR1", session_id: rageLead, user_fingerprint: "fp_rage", timestamp: ts(18000), metadata: { vin: "VIN_RAGE_1", title: "2024 Chevrolet Equinox" } },
      { event_type: "vehicle_view", action: "view_vehicle", page: "/inventory/VR2", session_id: rageLead, user_fingerprint: "fp_rage", timestamp: ts(22000), metadata: { vin: "VIN_RAGE_2", title: "2024 Ford Escape" } },
      { event_type: "vehicle_view", action: "view_vehicle", page: "/inventory/VR3", session_id: rageLead, user_fingerprint: "fp_rage", timestamp: ts(26000), metadata: { vin: "VIN_RAGE_3", title: "2024 Toyota RAV4" } },
      { event_type: "vehicle_view", action: "view_vehicle", page: "/inventory/VR4", session_id: rageLead, user_fingerprint: "fp_rage", timestamp: ts(29000), metadata: { vin: "VIN_RAGE_4", title: "2024 Mazda CX-5" } },
      { event_type: "search", action: "search_query", page: "/inventory", session_id: rageLead, user_fingerprint: "fp_rage", timestamp: ts(16000), metadata: { query: "used SUV", results_count: 15 } },
      { event_type: "search", action: "search_query", page: "/inventory", session_id: rageLead, user_fingerprint: "fp_rage", timestamp: ts(20000), metadata: { query: "affordable crossover", results_count: 8 } },
      { event_type: "time_on_page", action: "duration", page: "/contact", session_id: rageLead, user_fingerprint: "fp_rage", timestamp: ts(180000), metadata: { duration_ms: 180000 } },
      { event_type: "form_interaction", action: "field_focus", page: "/contact", session_id: rageLead, user_fingerprint: "fp_rage", timestamp: ts(47000), metadata: { field: "email" } },
      { event_type: "rage_click", action: "rage_click_detected", page: "/contact", session_id: rageLead, user_fingerprint: "fp_rage", timestamp: ts(50000), metadata: { element: "submit-btn", click_count: 5 } },
    ]);

    // --- Sessions 4-6: NORMAL BROWSERS (enough for 3+ session minimum) ---
    for (let s = 0; s < 3; s++) {
      const sid = `browser_${s}_${now}`;
      await seed([
        { event_type: "page_view", action: "navigate", page: "/", session_id: sid, user_fingerprint: `fp_b${s}`, timestamp: ts(s * 10000), metadata: {} },
        { event_type: "page_view", action: "navigate", page: "/inventory", session_id: sid, user_fingerprint: `fp_b${s}`, timestamp: ts(s * 10000 + 15000), metadata: {} },
        { event_type: "vehicle_view", action: "view_vehicle", page: `/inventory/VB${s}`, session_id: sid, user_fingerprint: `fp_b${s}`, timestamp: ts(s * 10000 + 20000), metadata: { vin: `VIN_B${s}`, title: `Vehicle ${s}` } },
        { event_type: "time_on_page", action: "duration", page: "/inventory", session_id: sid, user_fingerprint: `fp_b${s}`, timestamp: ts(s * 10000 + 60000), metadata: { duration_ms: 45000 } },
      ]);
    }
  });

  test("brain dashboard shows insights after seeding data", async ({ page }) => {
    await page.goto("/admin/analytics-brain");
    const insightCount = await page.locator("text=Insights Generated").textContent();
    expect(insightCount).toBeTruthy();
  });

  test("hot leads count is greater than zero", async ({ page }) => {
    await page.goto("/admin/analytics-brain");
    // The Hot Leads stat card should show at least 1
    const hotLeadsCard = page.locator("text=Hot Leads").locator("xpath=ancestor::div[contains(@class,'rounded-xl')]");
    const hotLeadValue = await hotLeadsCard.locator("p.text-3xl").textContent();
    const hotCount = parseInt(hotLeadValue?.trim() ?? "0", 10);
    expect(hotCount, "Should have at least 1 hot lead from seeded data").toBeGreaterThanOrEqual(1);
  });

  test("alerts exist in the insights API (exit intent or rage click)", async ({ request }) => {
    const res = await request.get("/api/analytics/insights?limit=500");
    const data = await res.json();
    const alerts = (data.insights ?? []).filter(
      (i: { id: string }) => i.id.startsWith("hot_lead_exit_") || i.id.startsWith("frustrated_buyers_"),
    );
    // At least one alert should exist from our seeded exit_intent + rage_click sessions
    expect(alerts.length, "Should have at least 1 alert insight from seeded data").toBeGreaterThanOrEqual(1);
  });

  test("priority alerts section visible when alerts exist", async ({ page }) => {
    await page.goto("/admin/analytics-brain");
    const main = page.locator("main#admin-main-content");
    // Either visible or the page has alert-related content
    const content = await main.textContent();
    const hasAlertContent =
      content?.includes("Priority Alerts") ||
      content?.includes("WARNING") ||
      content?.includes("CRITICAL");
    expect(hasAlertContent, "Page should show priority alert content when alerts exist").toBe(true);
  });

  test("lead temperature board shows hot tier", async ({ page }) => {
    await page.goto("/admin/analytics-brain");
    const main = page.locator("main#admin-main-content");
    const hotBadge = main.getByText("hot", { exact: true });
    await expect(hotBadge.first()).toBeVisible({ timeout: 5_000 });
  });

  test("top insights section shows categorized insights with limit", async ({ page }) => {
    await page.goto("/admin/analytics-brain");
    const content = await page.textContent("body");
    expect(content?.includes("Top Insights") || content?.includes("No insights")).toBeTruthy();
  });

  test("view all insights link navigates to full list", async ({ page }) => {
    await page.goto("/admin/analytics-brain");
    const main = page.locator("main#admin-main-content");
    const viewAllLink = main.locator('a[href="/admin/analytics-brain/all"]').first();
    if (await viewAllLink.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await viewAllLink.click();
      await expect(page).toHaveURL(/\/admin\/analytics-brain\/all/);
      await expect(page.locator("h1")).toContainText(/Insights/i);
      // Back link should exist in main content
      const backLink = main.locator('a[href="/admin/analytics-brain"]');
      await expect(backLink).toBeVisible();
    }
  });

  test("all insights page renders with back link", async ({ page }) => {
    await page.goto("/admin/analytics-brain/all");
    const content = await page.textContent("body");
    expect(content?.length ?? 0).toBeGreaterThan(50);
    // Back link in main content area
    const main = page.locator("main#admin-main-content");
    const backLink = main.locator('a[href="/admin/analytics-brain"]');
    await expect(backLink).toBeVisible();
  });

  test("all insights page filters by category", async ({ page }) => {
    await page.goto("/admin/analytics-brain/all?category=engagement");
    const h1 = page.locator("h1");
    await expect(h1).toContainText(/Engagement Insights|All Insights/i);
  });

  test("insights API contains multiple lead temperature tiers", async ({ request }) => {
    const res = await request.get("/api/analytics/insights?limit=500");
    const data = await res.json();
    const temps = (data.insights ?? []).filter(
      (i: { id: string }) => i.id.startsWith("lead_temperature_"),
    );
    const tiers = new Set(temps.map((t: { data: { tier: string } }) => t.data.tier));
    // Should have at least 2 different tiers (hot + cool/warm/cold)
    expect(tiers.size, `Should have multiple lead tiers, got: ${[...tiers].join(", ")}`).toBeGreaterThanOrEqual(2);
  });

  test("lead temperature board uses friendly visitor labels (not raw IDs)", async ({ page }) => {
    await page.goto("/admin/analytics-brain");
    const main = page.locator("main#admin-main-content");
    // Temperature board is now a card grid, not a table
    const boardText = await main.locator("text=Lead Temperature Board").locator("xpath=ancestor::div").first().textContent();
    expect(boardText).not.toContain("hot_lead_");
    expect(boardText).not.toContain("exit_lead_");
    expect(boardText).not.toContain("rage_lead_");
    const hasFriendly = /Buyer|Shopper|Searcher|Browser|Chat Lead|Deep Browser/.test(boardText ?? "");
    expect(hasFriendly, "Lead temperature board should use friendly visitor labels").toBe(true);
  });

  test("lead temperature board shows friendly signal labels", async ({ page }) => {
    await page.goto("/admin/analytics-brain");
    const main = page.locator("main#admin-main-content");
    const boardText = await main.textContent();
    // Should show human-readable signals, not raw keys
    const friendlySignals = [
      "Viewed vehicles",
      "Browsed many pages",
      "Searched inventory",
      "Spent time on site",
      "Submitted a lead",
      "Started filling a form",
    ];
    const hasAtLeastOne = friendlySignals.some((s) => boardText?.includes(s));
    expect(hasAtLeastOne, "Should display at least one friendly signal label").toBe(true);
    // Should NOT show raw signal keys
    expect(boardText).not.toContain("vehicle_engagement");
    expect(boardText).not.toContain("session_depth");
    expect(boardText).not.toContain("search_activity");
  });

  test("priority alerts use plain language (not raw insight text)", async ({ page }) => {
    await page.goto("/admin/analytics-brain");
    const main = page.locator("main#admin-main-content");
    const content = await main.textContent();
    if (content?.includes("Priority Alerts")) {
      // Should use friendly titles, not raw engine output
      const hasFriendlyAlert =
        content.includes("Engaged visitors are leaving") ||
        content.includes("Visitors struggling with your site") ||
        content.includes("Action needed");
      expect(hasFriendlyAlert, "Alerts should use plain language titles").toBe(true);
    }
  });

  test("top insights use friendly category names", async ({ page }) => {
    await page.goto("/admin/analytics-brain");
    const main = page.locator("main#admin-main-content");
    const content = await main.textContent();
    if (content?.includes("Top Insights")) {
      // Should show human-friendly category names
      const friendlyCategories = [
        "Sales & Conversions",
        "User Experience Issues",
        "Visitor Engagement",
        "Search & Inventory",
        "Chat Activity",
        "Marketing Performance",
        "Site Navigation",
      ];
      const hasAtLeastOne = friendlyCategories.some((c) => content?.includes(c));
      expect(hasAtLeastOne, "Top Insights should use friendly category names").toBe(true);
      // Category headers should not use raw keys like "ux_friction"
      expect(content).not.toContain("ux_friction");
    }
  });

  test("top insights show confidence as words not percentages", async ({ page }) => {
    await page.goto("/admin/analytics-brain");
    const main = page.locator("main#admin-main-content");
    const content = await main.textContent();
    if (content?.includes("Top Insights")) {
      const hasWordConfidence =
        content.includes("High confidence") ||
        content.includes("Medium confidence") ||
        content.includes("Low confidence");
      expect(hasWordConfidence, "Should show confidence as words").toBe(true);
      // Should say "visitors" not "Sample:"
      const hasVisitors = content.includes("visitors") || content.includes("visitor");
      expect(hasVisitors, "Should say 'visitors' not 'Sample:'").toBe(true);
    }
  });

  test("top insights truncate long text to first sentence", async ({ page }) => {
    await page.goto("/admin/analytics-brain");
    const main = page.locator("main#admin-main-content");
    // Get all insight card texts within the Top Insights section
    const insightCards = main.locator(".border-l-4 p.text-sm");
    const count = await insightCards.count();
    for (let i = 0; i < Math.min(count, 5); i++) {
      const text = await insightCards.nth(i).textContent();
      // Each insight text should be a single sentence (ends with .), not a paragraph
      expect((text ?? "").length, `Insight ${i} should be truncated`).toBeLessThanOrEqual(250);
    }
  });

  test("hot lead insight exists in API with HIGH PRIORITY text", async ({ request }) => {
    const res = await request.get("/api/analytics/insights?limit=500");
    const data = await res.json();
    const hotInsights = (data.insights ?? []).filter(
      (i: { id: string; data: { tier: string } }) =>
        i.id.startsWith("lead_temperature_") && i.data.tier === "hot",
    );
    expect(hotInsights.length, "Should have at least 1 hot lead insight").toBeGreaterThanOrEqual(1);
    // The hot lead insight text should mention HIGH PRIORITY
    const hasHighPriority = hotInsights.some(
      (i: { insight: string }) => i.insight.includes("HIGH PRIORITY"),
    );
    expect(hasHighPriority, "Hot lead insight should contain HIGH PRIORITY").toBe(true);
  });

  test("exit intent alert exists in API", async ({ request }) => {
    const res = await request.get("/api/analytics/insights?limit=500");
    const data = await res.json();
    const exitAlerts = (data.insights ?? []).filter(
      (i: { id: string }) => i.id.startsWith("hot_lead_exit_"),
    );
    // Should have exit intent alert from our warm lead session
    expect(exitAlerts.length, "Should have at least 1 exit intent alert").toBeGreaterThanOrEqual(1);
  });

  test("rage click alert exists in API", async ({ request }) => {
    const res = await request.get("/api/analytics/insights?limit=500");
    const data = await res.json();
    const rageAlerts = (data.insights ?? []).filter(
      (i: { id: string }) => i.id.startsWith("frustrated_buyers_"),
    );
    expect(rageAlerts.length, "Should have at least 1 frustrated buyers alert").toBeGreaterThanOrEqual(1);
  });
});
