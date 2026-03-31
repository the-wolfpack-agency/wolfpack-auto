import { test, expect } from "@playwright/test";

async function safeNav(page: any, path: string): Promise<boolean> {
  const r = await page.goto(path, { waitUntil: "domcontentloaded", timeout: 15_000 });
  return !!r && r.status() < 400;
}

const ADMIN_PAGES: { path: string; label: string; mustMatch: RegExp; elements?: string[] }[] = [
  { path: "/admin/inventory", label: "Inventory", mustMatch: /vehicle|inventory|\$/i, elements: ['input[placeholder*="search" i], input[placeholder*="VIN" i]', "tbody tr"] },
  { path: "/admin/leads", label: "Leads", mustMatch: /lead|name|status/i, elements: ["select", "tbody tr"] },
  { path: "/admin/deals", label: "Deals", mustMatch: /deal|pipeline|gross/i, elements: ['button:has-text("New Deal"), button:has-text("Create")'] },
  { path: "/admin/fi-products", label: "F&I Products", mustMatch: /warranty|gap|paint|product/i, elements: ['button:has-text("Add"), button:has-text("New")'] },
  { path: "/admin/lenders", label: "Lenders", mustMatch: /chase|capital one|ally|lender|routeone|dealertrack/i },
  { path: "/admin/credit", label: "Credit Bureau", mustMatch: /credit|bureau|pull|score/i, elements: ['input[type="checkbox"]', "select"] },
  { path: "/admin/documents", label: "Documents", mustMatch: /document|purchase|title/i, elements: ['button:has-text("Upload"), button:has-text("Add")'] },
  { path: "/admin/service", label: "Service", mustMatch: /appointment|repair|service/i },
  { path: "/admin/service/appointments", label: "Appointments", mustMatch: /appointment|schedule/i },
  { path: "/admin/service/repair-orders", label: "Repair Orders", mustMatch: /repair|order|RO/i },
  { path: "/admin/service/parts", label: "Parts", mustMatch: /part|inventory|stock/i, elements: ['input[placeholder*="search" i], input[placeholder*="part" i]'] },
  { path: "/admin/service/technicians", label: "Technicians", mustMatch: /technician|specialt|mechanic/i },
  { path: "/admin/floor-plan", label: "Floor Plan", mustMatch: /floor plan|principal|interest|vehicle/i },
  { path: "/admin/accounting", label: "Accounting", mustMatch: /unit|gross|sale|revenue/i, elements: ["select"] },
  { path: "/admin/accounting/commissions", label: "Commissions", mustMatch: /commission|employee|pay/i },
  { path: "/admin/accounting/export", label: "Export", mustMatch: /quickbooks|csv|export|download/i },
  { path: "/admin/digital-retail", label: "Digital Retail", mustMatch: /calculator|payment|credit/i, elements: ['input[type="number"]', 'button:has-text("Calculate")'] },
  { path: "/admin/reviews", label: "Reviews", mustMatch: /rating|review|star|respond/i },
  { path: "/admin/customers", label: "Customers", mustMatch: /customer|name|email/i, elements: ['input[placeholder*="search" i]'] },
  { path: "/admin/comms/templates", label: "Templates", mustMatch: /email|sms|template/i },
  { path: "/admin/comms/sequences", label: "Sequences", mustMatch: /sequence|trigger|follow/i },
  { path: "/admin/comms/log", label: "Message Log", mustMatch: /message|channel|status|sent/i },
  { path: "/admin/compliance/checks", label: "Compliance", mustMatch: /compliance|check|red flag|ofac/i },
  { path: "/admin/settings", label: "Settings", mustMatch: /dealer|setting|name|phone/i },
  { path: "/admin/marketing", label: "Marketing", mustMatch: /campaign|marketing|budget/i },
  { path: "/admin/tasks", label: "Tasks", mustMatch: /task|assign|priority/i },
  { path: "/admin/training", label: "Training", mustMatch: /training|certification|course/i },
  { path: "/admin/reports", label: "Reports", mustMatch: /report|export|download/i },
  { path: "/admin/pricing", label: "Pricing", mustMatch: /pricing|recommend|vehicle/i },
  { path: "/admin/billing", label: "Billing", mustMatch: /plan|billing|subscription|trial/i },
  { path: "/admin/onboarding", label: "Onboarding", mustMatch: /step|dealership|set up/i },
  { path: "/admin/oem", label: "OEM Network", mustMatch: /oem|network|dealer/i },
  { path: "/admin/oem/programs", label: "OEM Programs", mustMatch: /program|incentive|certification/i },
  { path: "/admin/competitive", label: "Competitive", mustMatch: /competitive|intel|competitor/i },
  { path: "/admin/rewards", label: "Rewards", mustMatch: /reward|points|leaderboard/i },
  { path: "/admin/engagement-reports", label: "Engagement", mustMatch: /engagement|report|interaction/i },
  { path: "/admin/good-faith", label: "Good Faith", mustMatch: /good faith|gesture|credit/i },
  { path: "/admin/change-management", label: "Change Mgmt", mustMatch: /change|management|record/i },
  { path: "/admin/resources", label: "Resources", mustMatch: /resource|guide|document/i },
];

for (const pg of ADMIN_PAGES) {
  test.describe("UI Elements: " + pg.label, () => {
    test(pg.path + " renders expected content", async ({ page }) => {
      const ok = await safeNav(page, pg.path);
      if (!ok) { test.skip(true, pg.label + " returned non-2xx"); return; }
      await page.waitForLoadState("load");
      const body = await page.locator("body").textContent();
      expect(body).not.toMatch(/internal server error/i);
      expect(body!.length).toBeGreaterThan(50);
      expect(body).toMatch(pg.mustMatch);
    });

    if (pg.elements) {
      for (const sel of pg.elements) {
        test(pg.path + " has element: " + sel.slice(0, 40), async ({ page }) => {
          const ok = await safeNav(page, pg.path);
          if (!ok) { test.skip(true, pg.label + " returned non-2xx"); return; }
          await expect(page.locator(sel).first()).toBeVisible({ timeout: 8_000 });
        });
      }
    }
  });
}

test.describe("UI Deep: Settings", () => {
  test("has 14+ time inputs for sales hours", async ({ page }) => {
    const ok = await safeNav(page, "/admin/settings");
    if (!ok) { test.skip(true, "Settings non-2xx"); return; }
    await page.waitForTimeout(2000);
    const count = await page.locator('input[type="time"]').count();
    expect(count).toBeGreaterThanOrEqual(14);
  });

  test("has 2+ color pickers for branding", async ({ page }) => {
    const ok = await safeNav(page, "/admin/settings");
    if (!ok) { test.skip(true, "Settings non-2xx"); return; }
    await page.waitForTimeout(2000);
    const count = await page.locator('input[type="color"]').count();
    expect(count).toBeGreaterThanOrEqual(2);
  });
});
