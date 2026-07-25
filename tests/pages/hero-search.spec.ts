import { test, expect } from "@playwright/test";

test.describe("Hero Search → Inventory Navigation", () => {
  test("hero search form exists with make select, query input, and submit button", async ({ page }) => {
    await page.goto("/");
    const form = page.locator('form[action="/inventory"]');
    await expect(form).toBeVisible();
    await expect(form.locator('select[name="make"]')).toBeVisible();
    await expect(form.locator('input[name="q"]')).toBeVisible();
    await expect(form.locator('button[type="submit"]')).toBeVisible();
  });

  test("submitting hero search navigates to /inventory with query params", async ({ page }) => {
    await page.goto("/");
    await page.locator('input[name="q"]').fill("RAV4");
    await page.locator('form[action="/inventory"] button[type="submit"]').click();
    await page.waitForURL(/\/inventory/);
    expect(page.url()).toContain("q=RAV4");
  });

  test("selecting a make and searching passes both params", async ({ page }) => {
    await page.goto("/");
    await page.locator('select[name="make"]').selectOption("Toyota");
    await page.locator('input[name="q"]').fill("hybrid");
    await page.locator('form[action="/inventory"] button[type="submit"]').click();
    await page.waitForURL(/\/inventory/);
    expect(page.url()).toContain("make=Toyota");
    expect(page.url()).toContain("q=hybrid");
  });

  test("hero search with make filter shows only matching vehicles", async ({ page }) => {
    await page.goto("/inventory?make=Toyota");
    const cards = page.locator('[aria-label="Search results"] a');
    const count = await cards.count();
    expect(count).toBeGreaterThan(0);
    // All visible cards should be Toyota
    for (let i = 0; i < count; i++) {
      const text = await cards.nth(i).textContent();
      expect(text?.toLowerCase()).toContain("toyota");
    }
  });

  test("hero search with q param filters inventory results", async ({ page }) => {
    await page.goto("/inventory?q=electric");
    const resultsText = await page.locator('[aria-label="Search results"]').textContent();
    // Should show results (electric vehicles exist in inventory)
    expect(resultsText).toBeTruthy();
    // The query should be displayed
    const showingText = await page.locator('text="electric"').first().textContent();
    expect(showingText).toBeTruthy();
  });

  test("hero search with no results shows empty state gracefully", async ({ page }) => {
    await page.goto("/inventory?q=xyznonexistentvehicle");
    const showing = page.locator('text="Showing"');
    await expect(showing).toBeVisible();
    const text = await showing.textContent();
    expect(text).toContain("0");
  });

  test("hero make dropdown includes all 14 makes", async ({ page }) => {
    await page.goto("/");
    const options = await page.locator('select[name="make"] option').allTextContents();
    const makes = options.filter((o) => o !== "Any Make");
    expect(makes.length).toBe(14);
    expect(makes).toContain("Toyota");
    expect(makes).toContain("Tesla");
    expect(makes).toContain("Hyundai");
    expect(makes).toContain("Kia");
    expect(makes).toContain("Volkswagen");
    expect(makes).toContain("Subaru");
  });
});
