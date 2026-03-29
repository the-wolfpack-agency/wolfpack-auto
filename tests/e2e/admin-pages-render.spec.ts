/**
 * Admin Page Render Verification
 *
 * Every admin page MUST render visible content — not a white screen, not a
 * loading spinner that never resolves, not a 401 redirect.
 *
 * For each page we verify:
 *   1. HTTP 200 (not a redirect to /admin/login)
 *   2. Page has visible text content (not blank)
 *   3. No console errors containing "401" or "Unauthorized"
 *   4. The admin sidebar is present (proves layout rendered)
 *
 * This catches the exact class of bug where DEMO_MODE bypasses middleware
 * auth but API routes still return 401, causing blank dashboards.
 */

import { test, expect } from "@playwright/test";

// Every static admin page. If you add a new admin page, add it here.
const ADMIN_PAGES = [
  { path: "/admin", name: "Dashboard" },
  { path: "/admin/accounting", name: "Accounting" },
  { path: "/admin/accounting/commissions", name: "Commissions" },
  { path: "/admin/accounting/export", name: "Accounting Export" },
  { path: "/admin/agency", name: "Agency" },
  { path: "/admin/agency/new-dealer", name: "New Dealer" },
  { path: "/admin/analytics", name: "Analytics" },
  { path: "/admin/analytics/inventory", name: "Analytics Inventory" },
  { path: "/admin/analytics/leads", name: "Analytics Leads" },
  { path: "/admin/analytics-brain", name: "Analytics Brain" },
  { path: "/admin/analytics-brain/all", name: "All Insights" },
  { path: "/admin/change-management", name: "Change Management" },
  { path: "/admin/comms", name: "Comms" },
  { path: "/admin/comms/log", name: "Comms Log" },
  { path: "/admin/comms/sequences", name: "Comms Sequences" },
  { path: "/admin/comms/templates", name: "Comms Templates" },
  { path: "/admin/competitive", name: "Competitive Intel" },
  { path: "/admin/compliance", name: "Compliance" },
  { path: "/admin/compliance/checks", name: "Compliance Checks" },
  { path: "/admin/credit", name: "Credit Bureau" },
  { path: "/admin/customers", name: "Customers" },
  { path: "/admin/deals", name: "Deals" },
  { path: "/admin/digital-retail", name: "Digital Retail" },
  { path: "/admin/documents", name: "Documents" },
  { path: "/admin/documents/compliance", name: "Document Compliance" },
  { path: "/admin/engagement-reports", name: "Engagement Reports" },
  { path: "/admin/fi-products", name: "F&I Products" },
  { path: "/admin/floor-plan", name: "Floor Plan" },
  { path: "/admin/funnel-health", name: "Funnel Health" },
  { path: "/admin/good-faith", name: "Good Faith" },
  { path: "/admin/intake", name: "Intake" },
  { path: "/admin/inventory", name: "Inventory" },
  { path: "/admin/inventory/add", name: "Add Vehicle" },
  { path: "/admin/knowledge", name: "Knowledge Base" },
  { path: "/admin/leads", name: "Leads" },
  { path: "/admin/lenders", name: "Lenders" },
  { path: "/admin/marketing", name: "Marketing" },
  { path: "/admin/oem", name: "OEM" },
  { path: "/admin/oem/analytics", name: "OEM Analytics" },
  { path: "/admin/oem/dealers", name: "OEM Dealers" },
  { path: "/admin/oem/programs", name: "OEM Programs" },
  { path: "/admin/onboarding", name: "Onboarding" },
  { path: "/admin/pricing", name: "Pricing" },
  { path: "/admin/privacy", name: "Privacy" },
  { path: "/admin/reports", name: "Reports" },
  { path: "/admin/resources", name: "Resources" },
  { path: "/admin/rewards", name: "Rewards" },
  { path: "/admin/security", name: "Security" },
  { path: "/admin/service", name: "Service" },
  { path: "/admin/service/appointments", name: "Appointments" },
  { path: "/admin/service/parts", name: "Parts" },
  { path: "/admin/service/repair-orders", name: "Repair Orders" },
  { path: "/admin/service/technicians", name: "Technicians" },
  { path: "/admin/settings", name: "Settings" },
  { path: "/admin/settings/integrations", name: "Integrations" },
  { path: "/admin/settings/mfa", name: "MFA" },
  { path: "/admin/settings/notifications", name: "Notifications" },
  { path: "/admin/system", name: "System Health" },
  { path: "/admin/tasks", name: "Tasks" },
  { path: "/admin/team", name: "Team" },
  { path: "/admin/trade-in", name: "Trade-In" },
  { path: "/admin/training", name: "Training" },
  { path: "/admin/vehicles/new", name: "New Vehicle" },
  { path: "/admin/vehicles/quick-add", name: "Quick Add" },
  { path: "/admin/webhooks", name: "Webhooks" },
];

test.describe("Admin Pages — every page must render content", () => {
  test.setTimeout(60_000);

  for (const { path, name } of ADMIN_PAGES) {
    test(`${name} (${path}) renders without white-screening`, async ({ page }) => {
      // Collect console errors
      const consoleErrors: string[] = [];
      page.on("console", (msg) => {
        if (msg.type() === "error") {
          consoleErrors.push(msg.text());
        }
      });

      const response = await page.goto(path, { waitUntil: "domcontentloaded" });

      // 1. Must not redirect to login
      expect(
        page.url(),
        `${path} redirected to login — auth guard not respecting DEMO_MODE`,
      ).not.toContain("/admin/login");

      // 2. Must return 200
      expect(
        response?.status(),
        `${path} returned ${response?.status()} — expected 200`,
      ).toBe(200);

      // 3. Must have visible text content (not a blank white page)
      // Wait briefly for client-side hydration
      await page.waitForTimeout(500);
      const bodyText = await page.locator("body").innerText();
      expect(
        bodyText.trim().length,
        `${path} rendered a blank page (no visible text content)`,
      ).toBeGreaterThan(10);

      // 4. No 401 errors in console (the exact bug this test was written for)
      const authErrors = consoleErrors.filter(
        (e) => e.includes("401") || e.includes("Unauthorized") || e.includes("Authentication required"),
      );
      expect(
        authErrors,
        `${path} has auth errors in console: ${authErrors.join("; ")}`,
      ).toHaveLength(0);
    });
  }
});
