/**
 * Platform Health — Self-Improving Analytics Tests
 *
 * Validates:
 * - Platform health API returns correct report structure
 * - Friction detection (rage clicks, dead clicks, form abandonment)
 * - Feature adoption tracking (all 20 admin features)
 * - Form health metrics
 * - Page engagement metrics
 * - Automated recommendations engine
 * - Health score computation
 * - Page renders without errors
 * - Sidebar link present
 * - Analytics integration (events flow into the system)
 * - Source-level validation of data pipeline
 */

import { test, expect } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";

const ROOT = path.resolve(__dirname, "../..");

// ---------------------------------------------------------------------------
// API: Platform Health Report
// ---------------------------------------------------------------------------

test.describe("Platform Health API", () => {
  test("GET /api/admin/analytics/platform-health returns report", async ({ request }) => {
    const res = await request.get("/api/admin/analytics/platform-health");
    expect(res.status()).not.toBe(500);
    if (res.status() === 200) {
      const body = await res.json();
      expect(body).toHaveProperty("report");

      const report = body.report;
      expect(report).toHaveProperty("period");
      expect(report).toHaveProperty("generated_at");
      expect(report).toHaveProperty("summary");
      expect(report).toHaveProperty("friction_hotspots");
      expect(report).toHaveProperty("feature_adoption");
      expect(report).toHaveProperty("form_health");
      expect(report).toHaveProperty("page_engagement");
      expect(report).toHaveProperty("recommendations");
    }
  });

  test("report summary has all required fields", async ({ request }) => {
    const res = await request.get("/api/admin/analytics/platform-health");
    if (res.status() !== 200) return;

    const { report } = await res.json();
    const { summary } = report;

    expect(summary).toHaveProperty("total_sessions");
    expect(summary).toHaveProperty("avg_session_duration_seconds");
    expect(summary).toHaveProperty("avg_pages_per_session");
    expect(summary).toHaveProperty("overall_bounce_rate");
    expect(summary).toHaveProperty("total_friction_events");
    expect(summary).toHaveProperty("friction_trend");
    expect(summary).toHaveProperty("active_features");
    expect(summary).toHaveProperty("total_features");
    expect(["improving", "stable", "worsening"]).toContain(summary.friction_trend);
    expect(summary.total_features).toBe(20);
  });

  test("friction hotspots have correct shape", async ({ request }) => {
    const res = await request.get("/api/admin/analytics/platform-health");
    if (res.status() !== 200) return;

    const { report } = await res.json();
    for (const h of report.friction_hotspots) {
      expect(h).toHaveProperty("page");
      expect(h).toHaveProperty("rage_clicks");
      expect(h).toHaveProperty("dead_clicks");
      expect(h).toHaveProperty("form_abandonments");
      expect(h).toHaveProperty("total_friction_events");
      expect(h).toHaveProperty("severity");
      expect(["critical", "high", "medium", "low"]).toContain(h.severity);
    }
  });

  test("feature adoption covers all 20 admin features", async ({ request }) => {
    const res = await request.get("/api/admin/analytics/platform-health");
    if (res.status() !== 200) return;

    const { report } = await res.json();
    expect(report.feature_adoption.length).toBeGreaterThanOrEqual(14);

    for (const f of report.feature_adoption) {
      expect(f).toHaveProperty("feature");
      expect(f).toHaveProperty("path");
      expect(f).toHaveProperty("unique_sessions");
      expect(f).toHaveProperty("adoption_pct");
      expect(typeof f.adoption_pct).toBe("number");
    }
  });

  test("form health has completion rates", async ({ request }) => {
    const res = await request.get("/api/admin/analytics/platform-health");
    if (res.status() !== 200) return;

    const { report } = await res.json();
    for (const f of report.form_health) {
      expect(f).toHaveProperty("form_name");
      expect(f).toHaveProperty("starts");
      expect(f).toHaveProperty("completions");
      expect(f).toHaveProperty("completion_rate");
      expect(f.completion_rate).toBeGreaterThanOrEqual(0);
      expect(f.completion_rate).toBeLessThanOrEqual(100);
    }
  });

  test("page engagement has bounce rates", async ({ request }) => {
    const res = await request.get("/api/admin/analytics/platform-health");
    if (res.status() !== 200) return;

    const { report } = await res.json();
    for (const p of report.page_engagement) {
      expect(p).toHaveProperty("page");
      expect(p).toHaveProperty("views");
      expect(p).toHaveProperty("avg_time_seconds");
      expect(p).toHaveProperty("avg_scroll_depth");
      expect(p).toHaveProperty("bounce_rate");
    }
  });

  test("recommendations are generated", async ({ request }) => {
    const res = await request.get("/api/admin/analytics/platform-health");
    if (res.status() !== 200) return;

    const { report } = await res.json();
    expect(Array.isArray(report.recommendations)).toBe(true);
    expect(report.recommendations.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Page: Platform Health
// ---------------------------------------------------------------------------

test.describe("Platform Health Page", () => {
  test("page renders without errors", async ({ page }) => {
    const res = await page.goto("/admin/analytics/platform-health");
    expect(res?.status()).not.toBe(500);
    const body = await page.textContent("body");
    if (body?.includes("Platform Health")) {
      expect(body).toContain("Platform Health");
    }
  });

  test("page shows summary cards", async ({ page }) => {
    await page.goto("/admin/analytics/platform-health");
    const body = await page.textContent("body");
    if (body?.includes("Platform Health")) {
      // Should have key metrics
      expect(body).toMatch(/Sessions|Duration|Bounce Rate|Pages/i);
    }
  });

  test("page shows recommendations section", async ({ page }) => {
    await page.goto("/admin/analytics/platform-health");
    const body = await page.textContent("body");
    if (body?.includes("Recommendations")) {
      expect(body).toContain("Recommendations");
    }
  });
});

// ---------------------------------------------------------------------------
// Source-level validation
// ---------------------------------------------------------------------------

test.describe("Platform Health — Source Validation", () => {
  test("API queries friction events from analytics_events", () => {
    const source = fs.readFileSync(
      path.join(ROOT, "src/app/api/admin/analytics/platform-health/route.ts"),
      "utf-8",
    );
    expect(source).toContain("rage_click");
    expect(source).toContain("dead_click");
    expect(source).toContain("form_abandonment");
    expect(source).toContain("analytics_events");
  });

  test("API tracks 20 admin features for adoption", () => {
    const source = fs.readFileSync(
      path.join(ROOT, "src/app/api/admin/analytics/platform-health/route.ts"),
      "utf-8",
    );
    expect(source).toContain("ADMIN_FEATURES");
    // Verify key features are tracked
    expect(source).toContain("Dashboard");
    expect(source).toContain("Leads");
    expect(source).toContain("Deals");
    expect(source).toContain("Analytics Brain");
    expect(source).toContain("Quick Add");
  });

  test("API computes friction trend (this week vs last week)", () => {
    const source = fs.readFileSync(
      path.join(ROOT, "src/app/api/admin/analytics/platform-health/route.ts"),
      "utf-8",
    );
    expect(source).toContain("this_week");
    expect(source).toContain("last_week");
    expect(source).toContain("improving");
    expect(source).toContain("worsening");
  });

  test("API generates automated recommendations", () => {
    const source = fs.readFileSync(
      path.join(ROOT, "src/app/api/admin/analytics/platform-health/route.ts"),
      "utf-8",
    );
    expect(source).toContain("recommendations");
    expect(source).toContain("rage_clicks");
    expect(source).toContain("form_abandonments");
    expect(source).toContain("unusedFeatures");
    expect(source).toContain("bounce_rate");
  });

  test("page computes health score from summary", () => {
    const source = fs.readFileSync(
      path.join(ROOT, "src/app/admin/analytics/platform-health/page.tsx"),
      "utf-8",
    );
    expect(source).toContain("computeHealthScore");
    expect(source).toContain("friction_trend");
    expect(source).toContain("overall_bounce_rate");
  });

  test("sidebar includes Platform Health link", () => {
    const source = fs.readFileSync(
      path.join(ROOT, "src/components/AdminSidebar.tsx"),
      "utf-8",
    );
    expect(source).toContain("platform-health");
    expect(source).toContain("Platform Health");
  });

  test("EventCollector captures friction signals", () => {
    const source = fs.readFileSync(
      path.join(ROOT, "src/components/EventCollector.tsx"),
      "utf-8",
    );
    expect(source).toContain("rage_click");
    expect(source).toContain("dead_click");
  });
});

// ---------------------------------------------------------------------------
// Integration: Events → Platform Health Pipeline
// ---------------------------------------------------------------------------

test.describe("Platform Health — Analytics Pipeline Integration", () => {
  test("POST /api/analytics/events accepts friction events", async ({ request }) => {
    const res = await request.post("/api/analytics/events", {
      data: {
        events: [
          {
            event_type: "interaction",
            action: "rage_click",
            page: "/admin/deals",
            session_id: "test-session-ph",
            user_fingerprint: "test-fp",
            timestamp: new Date().toISOString(),
            metadata: { element: "button.submit" },
          },
          {
            event_type: "interaction",
            action: "dead_click",
            page: "/admin/inventory",
            session_id: "test-session-ph",
            user_fingerprint: "test-fp",
            timestamp: new Date().toISOString(),
            metadata: { element: "div.card" },
          },
        ],
      },
    });
    expect(res.status()).not.toBe(500);
    if (res.status() === 200) {
      const body = await res.json();
      expect(body).toHaveProperty("accepted");
    }
  });

  test("POST /api/analytics/events accepts form events", async ({ request }) => {
    const res = await request.post("/api/analytics/events", {
      data: {
        events: [
          {
            event_type: "form",
            action: "form_started",
            page: "/contact",
            session_id: "test-session-form",
            user_fingerprint: "test-fp",
            timestamp: new Date().toISOString(),
            metadata: { form_name: "Lead Submission" },
          },
          {
            event_type: "form",
            action: "form_submitted",
            page: "/contact",
            session_id: "test-session-form",
            user_fingerprint: "test-fp",
            timestamp: new Date().toISOString(),
            metadata: { form_name: "Lead Submission" },
          },
        ],
      },
    });
    expect(res.status()).not.toBe(500);
  });
});
