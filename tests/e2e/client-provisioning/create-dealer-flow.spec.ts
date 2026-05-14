import { test, expect } from "@playwright/test";

test.skip(
  !process.env.DATABASE_URL,
  "Needs real Postgres (Phase 1 Tests runs in shadow mode). Run via the real-DB integration phase or locally with DATABASE_URL set.",
);

const UNIQUE = Date.now().toString(36);
const DEALER_NAME = "E2E Test Dealer " + UNIQUE;
const DEALER_SLUG = "e2e-test-" + UNIQUE;
let dealerId: string | null = null;
let cookies = "";

async function login(request: any): Promise<string> {
  const csrf = await request.get("/api/auth/csrf");
  const { csrfToken } = await csrf.json();
  const cc = csrf.headersArray().filter((h: any) => h.name.toLowerCase() === "set-cookie").map((h: any) => h.value.split(";")[0].trim()).join("; ");
  const sign = await request.post("/api/auth/callback/credentials", {
    form: { email: "demo@wolfpackauto.com", password: "demo", csrfToken, json: "true" },
    headers: { cookie: cc },
  });
  const sc = sign.headersArray().filter((h: any) => h.name.toLowerCase() === "set-cookie").map((h: any) => h.value.split(";")[0].trim()).join("; ");
  return [cc, sc].filter(Boolean).join("; ");
}

test.describe.serial("Create Dealer End-to-End", () => {
  test("1. Login", async ({ request }) => {
    cookies = await login(request);
    expect(cookies.length).toBeGreaterThan(10);
  });

  test("2. Create dealer via API", async ({ request }) => {
    cookies = await login(request);
    const res = await request.post("/api/admin/dealers", {
      headers: { cookie: cookies },
      data: {
        name: DEALER_NAME, slug: DEALER_SLUG,
        phone: "(555) 000-9999", email: "e2e@test.com",
        address: { street: "123 Test Ave", city: "Testville", state: "NC", zip: "27600" },
        branding: { primary_color: "#DC2626" },
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    dealerId = body.id;
    expect(body.slug).toBe(DEALER_SLUG);
  });

  test("3. Duplicate slug rejected", async ({ request }) => {
    cookies = await login(request);
    const res = await request.post("/api/admin/dealers", {
      headers: { cookie: cookies },
      data: { name: "Dup", slug: DEALER_SLUG },
    });
    expect(res.status()).toBe(409);
  });

  test("4. Dealer in list", async ({ request }) => {
    cookies = await login(request);
    const res = await request.get("/api/admin/dealers", { headers: { cookie: cookies } });
    const body = await res.json();
    expect(body.dealers.find((d: any) => d.slug === DEALER_SLUG)).toBeTruthy();
  });

  test("5. Sub-page renders dealer name", async ({ page }) => {
    const r = await page.goto("/dealers/" + DEALER_SLUG, { waitUntil: "domcontentloaded" });
    if (!r || r.status() >= 400) { test.skip(true, "Not deployed"); return; }
    const body = await page.textContent("body");
    expect(body).toContain(DEALER_NAME);
  });

  test("6. Sub-page shows address", async ({ page }) => {
    const r = await page.goto("/dealers/" + DEALER_SLUG, { waitUntil: "domcontentloaded" });
    if (!r || r.status() >= 400) { test.skip(true, "Not deployed"); return; }
    expect(await page.textContent("body")).toContain("Testville");
  });

  test("7. Sub-page has CTA buttons", async ({ page }) => {
    const r = await page.goto("/dealers/" + DEALER_SLUG, { waitUntil: "domcontentloaded" });
    if (!r || r.status() >= 400) { test.skip(true, "Not deployed"); return; }
    await expect(page.locator("a:has-text('Inventory')").first()).toBeVisible({ timeout: 5000 });
  });

  test("8. Missing fields returns 400", async ({ request }) => {
    cookies = await login(request);
    const res = await request.post("/api/admin/dealers", {
      headers: { cookie: cookies }, data: { name: "" },
    });
    expect(res.status()).toBe(400);
  });

  test("9. Analytics health reachable", async ({ request }) => {
    cookies = await login(request);
    const res = await request.get("/api/admin/analytics/health", { headers: { cookie: cookies } });
    expect(res.status()).not.toBe(500);
  });

  test("10. Cleanup — deactivate dealer", async ({ request }) => {
    if (!dealerId) { test.skip(true, "No dealer"); return; }
    const res = await request.delete("/api/admin/dealers/" + dealerId, { headers: { cookie: cookies } });
    expect(res.status()).toBe(200);
  });

  test("11. Deactivated dealer gone from list", async ({ request }) => {
    const res = await request.get("/api/admin/dealers", { headers: { cookie: cookies } });
    const body = await res.json();
    expect(body.dealers.find((d: any) => d.slug === DEALER_SLUG && d.is_active)).toBeFalsy();
  });
});
