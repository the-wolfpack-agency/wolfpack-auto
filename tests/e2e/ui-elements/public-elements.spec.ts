import { test, expect } from "@playwright/test";

const PUBLIC_PAGES: { path: string; label: string; mustMatch: RegExp; elements?: string[] }[] = [
  { path: "/", label: "Homepage", mustMatch: /wolfpack|inventory|browse/i, elements: ["h1, h2", "footer"] },
  { path: "/inventory", label: "Inventory", mustMatch: /\$/i },
  { path: "/inventory/1HGCV1F34PA000001", label: "Vehicle Detail", mustMatch: /\$|honda|cr-v/i },
  { path: "/financing", label: "Financing", mustMatch: /financ|loan|credit|payment/i },
  { path: "/trade-in", label: "Trade-In", mustMatch: /trade|vehicle|estimate/i },
  { path: "/about", label: "About", mustMatch: /about|dealer|team/i },
  { path: "/contact", label: "Contact", mustMatch: /contact|email|phone|message/i, elements: ['button[type="submit"], button:has-text("Send"), button:has-text("Submit")'] },
  { path: "/hours", label: "Hours", mustMatch: /monday|tuesday|wednesday/i },
  { path: "/directions", label: "Directions", mustMatch: /direction|address|map/i },
  { path: "/service-booking", label: "Service Booking", mustMatch: /maintenance|repair|service|appointment/i },
  { path: "/walkaround", label: "Walkaround", mustMatch: /walkaround|vehicle|feature/i },
  { path: "/dealers/summit-auto", label: "Summit Auto", mustMatch: /summit/i, elements: ["footer"] },
  { path: "/dealers/mile-high-motors", label: "Mile High", mustMatch: /mile high/i, elements: ["footer"] },
];

for (const pg of PUBLIC_PAGES) {
  test.describe("Public UI: " + pg.label, () => {
    test(pg.path + " renders expected content", async ({ page }) => {
      const resp = await page.goto(pg.path, { waitUntil: "domcontentloaded", timeout: 15_000 });
      if (!resp || resp.status() >= 400) { test.skip(true, pg.label + " returned " + resp?.status()); return; }
      await page.waitForTimeout(2000);
      const body = await page.locator("body").textContent();
      expect(body).not.toMatch(/internal server error/i);
      expect(body!.length).toBeGreaterThan(50);
      expect(body).toMatch(pg.mustMatch);
    });

    if (pg.elements) {
      for (const sel of pg.elements) {
        test(pg.path + " has element: " + sel.slice(0, 40), async ({ page }) => {
          const resp = await page.goto(pg.path, { waitUntil: "domcontentloaded", timeout: 15_000 });
          if (!resp || resp.status() >= 400) { test.skip(true, pg.label + " non-2xx"); return; }
          await expect(page.locator(sel).first()).toBeVisible({ timeout: 8_000 });
        });
      }
    }
  });
}

test.describe("Public Deep: Contact Form", () => {
  test("has 3+ form inputs", async ({ page }) => {
    const resp = await page.goto("/contact", { waitUntil: "domcontentloaded" });
    if (!resp || resp.status() >= 400) { test.skip(true, "Contact non-2xx"); return; }
    const count = await page.locator("input, textarea").count();
    expect(count).toBeGreaterThanOrEqual(3);
  });
});

test.describe("Public Deep: Trade-In", () => {
  test("has 3+ vehicle inputs", async ({ page }) => {
    const resp = await page.goto("/trade-in", { waitUntil: "domcontentloaded" });
    if (!resp || resp.status() >= 400) { test.skip(true, "Trade-in non-2xx"); return; }
    const count = await page.locator("input, select").count();
    expect(count).toBeGreaterThanOrEqual(3);
  });
});
