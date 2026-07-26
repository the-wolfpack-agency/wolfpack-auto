import { test, expect } from "@playwright/test";

test.describe("Help / Support Center search", () => {
  test("static page renders the FAQ categories", async ({ page }) => {
    await page.goto("/help", { waitUntil: "domcontentloaded" });
    await expect(
      page.getByRole("heading", { name: "How Can We Help?" }),
    ).toBeVisible();
    // No query yet -> no results section.
    await expect(
      page.locator("#help-results-heading"),
    ).toHaveCount(0);
    await expect(page.getByText("Buying a Vehicle").first()).toBeVisible();
  });

  test("submitting the search returns matching answers", async ({ page }) => {
    await page.goto("/help", { waitUntil: "domcontentloaded" });

    await page.getByPlaceholder("Search for answers...").fill("financing");
    await page.getByRole("button", { name: "Search" }).click();

    // Navigated to the results URL and the query persists in the box.
    await expect(page).toHaveURL(/\/help\?q=financing/);
    await expect(page.getByPlaceholder("Search for answers...")).toHaveValue(
      "financing",
    );

    // A results heading appears with at least one hit, and the matching
    // answer is actually rendered (not just a title). Scope to the results
    // section since the same Q&A also appears in the full FAQ accordion below.
    const resultsSection = page.locator(
      'section[aria-labelledby="help-results-heading"]',
    );
    await expect(resultsSection.locator("#help-results-heading")).toContainText(
      /result/i,
    );
    await expect(
      resultsSection.getByText("What financing options are available?"),
    ).toBeVisible();
    await expect(
      resultsSection.getByText(/we work with over 30 lenders/i),
    ).toBeVisible();
  });

  test("deep-linked query renders results directly", async ({ page }) => {
    await page.goto("/help?q=trade-in", { waitUntil: "domcontentloaded" });
    const resultsSection = page.locator(
      'section[aria-labelledby="help-results-heading"]',
    );
    await expect(resultsSection.locator("#help-results-heading")).toContainText(
      /result/i,
    );
    await expect(
      resultsSection.getByText("How does the trade-in process work?"),
    ).toBeVisible();
  });

  test("a no-match query shows an empty state with contact fallback", async ({
    page,
  }) => {
    await page.goto("/help?q=zzzznope", { waitUntil: "domcontentloaded" });
    const resultsSection = page.locator(
      'section[aria-labelledby="help-results-heading"]',
    );
    await expect(resultsSection.locator("#help-results-heading")).toContainText(
      /no results/i,
    );
    await expect(
      resultsSection.getByRole("link", { name: "Contact Us" }),
    ).toBeVisible();
  });
});
