import { test, expect } from "@playwright/test";

/**
 * Chat Widget tests.
 *
 * Uses the stable aria-label "Open chat assistant" to locate the bubble
 * rather than scanning buttons in reverse order.
 */

// Shadow-mode skip: chat widget requires dealer config from Postgres (the
// "Wolfpack Motors" header text comes from dealer_branding rows) and the
// "type message and get response" test hits /api/chat which needs DB-backed
// inventory + suggested-actions. Re-run via the real-DB integration phase.
test.skip(
  !process.env.DATABASE_URL,
  "Needs real Postgres (Phase 1 Tests runs in shadow mode). Run via the real-DB integration phase or locally with DATABASE_URL set.",
);

async function openChat(page: import("@playwright/test").Page) {
  const bubble = page.locator('button[aria-label="Open chat assistant"]');
  await expect(bubble).toBeVisible({ timeout: 8_000 });
  // Use tap on mobile (webkit), click on desktop — both work via .click()
  // but we scroll into view first to ensure it's not obscured.
  await bubble.scrollIntoViewIfNeeded();
  await bubble.click({ force: true });
  // Wait for the chat panel — the panel has a unique aria-label
  const panel = page.locator("div[role='dialog']").filter({
    has: page.locator('button[aria-label="Close chat"]'),
  });
  await expect(panel).toBeVisible({ timeout: 8_000 });
  return panel;
}

test.describe("Chat Widget", () => {
  test.beforeEach(async ({ page }) => {
    // Pre-accept cookies so the consent banner never blocks the chat bubble
    await page.addInitScript(() => {
      localStorage.setItem("cookie_consent", "essential");
    });
    // Use load (not domcontentloaded) so React hydration is complete before tests run
    await page.goto("/", { waitUntil: "load" });
  });

  test("chat bubble visible on page load", async ({ page }) => {
    const bubble = page.locator('button[aria-label="Open chat assistant"]');
    await expect(bubble).toBeVisible({ timeout: 5_000 });
  });

  test("click opens chat panel with welcome message", async ({ page }) => {
    const panel = await openChat(page);
    // Header h2 always contains "Wolfpack Motors" — most reliable signal
    await expect(panel.locator("h2")).toContainText(/Wolfpack Motors/i);
  });

  test("type message and get response", async ({ page }) => {
    const panel = await openChat(page);

    const input = panel.locator("#chat-input");
    await expect(input).toBeVisible();
    await input.fill("hello");

    const sendBtn = panel.locator("button[aria-label='Send message']");
    await sendBtn.click();

    // Wait for response (typing indicator then assistant message)
    const log = panel.locator("[role='log']");
    await expect(log).toBeVisible({ timeout: 10_000 });
  });

  test("close button closes panel", async ({ page }) => {
    const panel = await openChat(page);

    const closeBtn = panel.locator("button[aria-label='Close chat']");
    await expect(closeBtn).toBeVisible();
    await closeBtn.click();

    await expect(panel).not.toBeVisible({ timeout: 3_000 });
  });

  test("escape key closes panel", async ({ page }) => {
    const panel = await openChat(page);
    await page.keyboard.press("Escape");
    await expect(panel).not.toBeVisible({ timeout: 3_000 });
  });

  test("chat input has correct attributes", async ({ page }) => {
    const panel = await openChat(page);

    const input = panel.locator("#chat-input");
    await expect(input).toBeVisible();
    await expect(input).toHaveAttribute("maxlength", "500");
    await expect(input).toHaveAttribute("autocomplete", "off");
    await expect(input).toHaveAttribute("placeholder", "Type a message...");
  });

  test("chat panel does not appear on admin pages", async ({ page }) => {
    await page.goto("/admin", { waitUntil: "domcontentloaded" });

    // ChatWidget is not rendered in admin — bubble must not exist
    const bubble = page.locator('button[aria-label="Open chat assistant"]');
    await expect(bubble).not.toBeVisible({ timeout: 3_000 });
  });
});
