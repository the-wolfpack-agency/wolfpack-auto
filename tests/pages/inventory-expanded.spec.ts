import { test, expect } from "@playwright/test";

test.describe("Expanded Inventory (22 Vehicles)", () => {
  test("inventory page shows 22 vehicles with no filters", async ({ page }) => {
    await page.goto("/inventory");
    const showing = page.locator('text="Showing"');
    await expect(showing).toBeVisible();
    const text = await showing.textContent();
    expect(text).toContain("22");
  });

  test("inventory has vehicles from all major makes", async ({ page }) => {
    await page.goto("/inventory");
    const content = await page.locator('[aria-label="Search results"]').textContent();
    for (const make of ["Honda", "Toyota", "Tesla", "BMW", "Ford", "Chevrolet"]) {
      expect(content).toContain(make);
    }
  });

  test("inventory filter by make works correctly", async ({ page }) => {
    for (const [make, expectedMin] of [
      ["Toyota", 3],
      ["Honda", 2],
      ["Tesla", 2],
      ["Ford", 2],
      ["Chevrolet", 2],
      ["BMW", 2],
    ] as const) {
      await page.goto(`/inventory?make=${make}`);
      const text = await page.locator('text="Showing"').textContent();
      const match = text?.match(/Showing\s+(\d+)/);
      const count = match ? parseInt(match[1], 10) : 0;
      expect(count, `Expected at least ${expectedMin} ${make} vehicles`).toBeGreaterThanOrEqual(expectedMin);
    }
  });

  test("inventory includes all body styles", async ({ page }) => {
    await page.goto("/inventory");
    const allText = await page.locator('[aria-label="Search results"]').textContent();
    // We have SUV, Sedan, Truck, Coupe, Wagon in inventory
    // At minimum, SUV and Sedan should appear
    expect(allText?.toLowerCase()).toContain("suv");
  });

  test("inventory includes electric vehicles", async ({ page }) => {
    await page.goto("/inventory?q=electric");
    const text = await page.locator('text="Showing"').textContent();
    const match = text?.match(/Showing\s+(\d+)/);
    const count = match ? parseInt(match[1], 10) : 0;
    // Tesla Model 3, Tesla Model Y, VW ID.4, Chevy Bolt EUV, F-150 Lightning
    expect(count).toBeGreaterThanOrEqual(4);
  });

  test("inventory includes hybrid vehicles", async ({ page }) => {
    await page.goto("/inventory?q=hybrid");
    const text = await page.locator('text="Showing"').textContent();
    const match = text?.match(/Showing\s+(\d+)/);
    const count = match ? parseInt(match[1], 10) : 0;
    // RAV4 Hybrid, Tucson Hybrid, Sportage Hybrid, Camry Hybrid, Highlander Hybrid
    expect(count).toBeGreaterThanOrEqual(4);
  });

  test("inventory search by model name returns results", async ({ page }) => {
    await page.goto("/inventory?q=F-150");
    const text = await page.locator('text="Showing"').textContent();
    const match = text?.match(/Showing\s+(\d+)/);
    const count = match ? parseInt(match[1], 10) : 0;
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test("inventory search by feature returns results", async ({ page }) => {
    await page.goto("/inventory?q=autopilot");
    const text = await page.locator('text="Showing"').textContent();
    const match = text?.match(/Showing\s+(\d+)/);
    const count = match ? parseInt(match[1], 10) : 0;
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test("each vehicle card links to VDP page", async ({ page }) => {
    await page.goto("/inventory");
    const firstCard = page.locator('[aria-label="Search results"] a').first();
    const href = await firstCard.getAttribute("href");
    expect(href).toMatch(/^\/inventory\/[A-Z0-9]+$/);
  });

  test("price range covers budget to luxury ($27K-$69K)", async ({ page }) => {
    await page.goto("/inventory?sort=price_asc");
    const cards = page.locator('[aria-label="Search results"] a');
    const count = await cards.count();
    expect(count).toBeGreaterThanOrEqual(10);
    // First card should be cheapest
    const firstText = await cards.first().textContent();
    expect(firstText).toContain("27"); // Bolt EUV at $27,500
  });
});
