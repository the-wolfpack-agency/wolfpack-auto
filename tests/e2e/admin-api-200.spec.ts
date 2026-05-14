/**
 * Admin API 200 Verification
 *
 * Every GET admin API route MUST return 200 with valid JSON when the platform
 * is in DEMO_MODE. A 401, 403, or 500 here means a white page for the user.
 *
 * This test exists because shadow-hardening tests only assert "not 500",
 * which allowed 401s to slip through and cause blank dashboards.
 *
 * If any of these fail, the root cause is likely:
 *   1. requireAuth() not respecting DEMO_MODE
 *   2. A new route missing shadow mode fallback
 *   3. A database query failing without a catch block
 */

import { test, expect } from "@playwright/test";

test.skip(
  !process.env.DATABASE_URL,
  "Needs real Postgres (Phase 1 Tests runs in shadow mode). Run via the real-DB integration phase or locally with DATABASE_URL set.",
);

// Every GET admin API route that powers a dashboard page.
// These MUST return 200 — a non-200 means a white page for the client.
const ADMIN_GET_ROUTES = [
  "/api/admin/stats",
  "/api/admin/analytics/dashboard",
  "/api/admin/analytics/health",
  "/api/admin/analytics/learning",
  "/api/admin/trade-in",
  "/api/admin/lenders",
  "/api/admin/deals",
  "/api/admin/compliance",
  "/api/admin/compliance/checks",
  "/api/admin/credit/history",
  "/api/admin/floor-plan",
  "/api/admin/documents",
  "/api/admin/accounting/sales-log",
  "/api/admin/accounting/commissions",
  "/api/admin/accounting/summary",
  "/api/admin/accounting/chart-of-accounts",
  "/api/admin/export/analytics",
  // "/api/admin/export/leads", — returns CSV not JSON (correct)

  "/api/admin/billing",
  "/api/admin/digital-retail/credit-app",
  // "/api/admin/mfa/status", — queries dealer_users for demo user (404 expected in demo)

  "/api/admin/intake/recommendations",
  "/api/admin/leads",
  "/api/admin/customers",
  "/api/admin/reviews",
  "/api/admin/reviews/templates",
  "/api/admin/resources",
  "/api/admin/training",
  "/api/admin/funnel-health",
  "/api/admin/dealers",
  "/api/admin/dealer-users",
  "/api/admin/webhooks",
  "/api/admin/webhooks/deliveries",
  // "/api/admin/domains", — requires dealerId query param

  "/api/admin/alerts",
  "/api/admin/engagement-reports",
  "/api/admin/fi-products",
  "/api/admin/good-faith",
  "/api/admin/rewards",
  "/api/admin/service/appointments",
  "/api/admin/service/repair-orders",
  "/api/admin/service/parts",
  "/api/admin/service/technicians",
  "/api/admin/settings",
  "/api/admin/settings/integrations",
  "/api/admin/settings/notifications",
  "/api/admin/comms",
  "/api/admin/comms/templates",
  "/api/admin/comms/sequences",
  "/api/admin/comms/log",
  "/api/admin/competitive",
  "/api/admin/change-management",
  "/api/admin/marketing",
  "/api/admin/pricing",
  "/api/admin/tasks",
  "/api/admin/system/health",
  "/api/admin/oem",
  "/api/admin/oem/dealers",
  "/api/admin/oem/programs",
  "/api/admin/oem/analytics",
  "/api/admin/security/scan",
  "/api/admin/knowledge/ingest",
];

test.describe("Admin API — every route must return 200", () => {
  for (const route of ADMIN_GET_ROUTES) {
    test(`GET ${route} → 200`, async ({ request }) => {
      const resp = await request.get(route);
      const status = resp.status();

      // Capture body for debugging on failure
      if (status !== 200) {
        const body = await resp.text().catch(() => "(no body)");
        expect(
          status,
          `${route} returned ${status} instead of 200. Body: ${body.slice(0, 200)}`,
        ).toBe(200);
      }

      // Must be JSON
      const contentType = resp.headers()["content-type"] ?? "";
      expect(
        contentType,
        `${route} must return JSON, got: ${contentType}`,
      ).toContain("application/json");
    });
  }
});
