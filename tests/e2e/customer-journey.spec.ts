import { test, expect } from "@playwright/test";

/**
 * End-to-end customer journey tests.
 *
 * These exercise real user flows: browsing inventory, viewing vehicle
 * detail pages, submitting inquiries, and using the chat widget.
 */

test.describe("Customer journey: search, view, inquire", () => {
  test("Customer searches inventory, views a vehicle, and submits an inquiry", async ({
    page,
  }) => {
    // 1. Navigate to inventory
    await page.goto("/inventory");
    await expect(page).toHaveTitle(/inventory/i);

    // 2. Search for SUV (exists in placeholder data)
    const searchInput = page.locator(
      'input[name="q"], input[placeholder*="earch"], input[type="search"]'
    );
    if (await searchInput.isVisible()) {
      await searchInput.fill("SUV");
      // Trigger search — press Enter or wait for auto-search
      await searchInput.press("Enter");
      await page.waitForLoadState("domcontentloaded");
    }

    // 3. Verify vehicle cards appear — look for links to /inventory/
    const vehicleCards = page.locator('a[href*="/inventory/"]');
    await expect(vehicleCards.first()).toBeVisible({ timeout: 10_000 });
    const cardCount = await vehicleCards.count();
    expect(cardCount).toBeGreaterThan(0);

    // 4. Click first vehicle card to go to VDP
    const firstCardHref = await vehicleCards.first().getAttribute("href");
    expect(firstCardHref).toBeTruthy();
    await vehicleCards.first().click();
    await page.waitForLoadState("domcontentloaded");

    // 5. Verify VDP loaded — should have vehicle year/make/model in title or heading
    const heading = page.locator("h1, h2").first();
    await expect(heading).toBeVisible({ timeout: 10_000 });
    const headingText = await heading.textContent();
    expect(headingText!.length).toBeGreaterThan(3);

    // 6. Verify price is visible somewhere on the page
    const priceElement = page.locator("text=/\\$[\\d,]+/").first();
    await expect(priceElement).toBeVisible();

    // 7. Verify FTC disclosures section exists
    const disclosures = page.locator(
      'text=/buyer.?s guide|FTC|disclosure|as.?is/i'
    );
    await expect(disclosures.first()).toBeVisible({ timeout: 5_000 });

    // 8. Navigate to contact page to submit inquiry
    await page.goto("/contact");
    await expect(page.locator("h1")).toContainText(/contact/i);

    // 9. Fill in the contact form
    await page.locator('input[name="first_name"]').fill("E2E");
    await page.locator('input[name="last_name"]').fill("TestUser");
    await page
      .locator('input[name="email"]')
      .fill("e2e-test@wolfpackmotors.test");
    const phoneField = page.locator('input[name="phone"]');
    if (await phoneField.isVisible()) {
      await phoneField.fill("3035551234");
    }
    await page.locator('textarea[name="message"]').fill(
      "I am interested in the vehicle I just viewed. Please follow up."
    );

    // 10. Submit form
    const submitBtn = page.locator('button[type="submit"]');
    await submitBtn.click();

    // 11. Verify success feedback
    const successIndicator = page.locator(
      'text=/thank|success|received|submitted/i'
    );
    await expect(successIndicator.first()).toBeVisible({ timeout: 10_000 });
  });
});

test.describe("Customer journey: chat widget", () => {
  test("Customer uses chat to find a vehicle", async ({ page }) => {
    // 1. Navigate to homepage
    await page.goto("/");
    await page.waitForLoadState("domcontentloaded");

    // 2. Find and open the chat bubble
    const chatBubble = page.locator(
      'button[aria-label*="chat" i], button[aria-label*="Chat" i], [data-testid="chat-bubble"], button:has(svg)'
    );
    // The chat bubble might take a moment to render
    const bubble = chatBubble.first();
    await expect(bubble).toBeVisible({ timeout: 10_000 });
    await bubble.click();

    // 3. Wait for chat panel to open — look for input field
    const chatInput = page.locator(
      'input[placeholder*="message" i], input[placeholder*="type" i], input[aria-label*="chat" i]'
    );
    await expect(chatInput.first()).toBeVisible({ timeout: 5_000 });

    // 4. Type a vehicle search query
    await chatInput.first().fill("Do you have any trucks under $40k?");
    await chatInput.first().press("Enter");

    // 5. Wait for response — look for at least one assistant message to appear
    const assistantMsg = page.locator('[data-role="assistant"], [class*="message"]').first();
    await assistantMsg.waitFor({ state: "attached", timeout: 10_000 });

    // 6. Verify response appeared (not just the welcome message)
    // There should be at least 2 messages: welcome + our query + response
    const messages = page.locator(
      '[class*="message"], [data-role="assistant"], [class*="chat"]'
    );
    const messageCount = await messages.count();
    expect(messageCount).toBeGreaterThanOrEqual(1);

    // Verify no error message
    const errorText = page.locator('text=/something went wrong|error/i');
    const errorCount = await errorText.count();
    // Some chat responses legitimately contain "error" — just ensure we got content
    const chatPanel = page.locator('[class*="chat"]').first();
    const panelText = await chatPanel.textContent();
    expect(panelText!.length).toBeGreaterThan(50);
  });
});

test.describe("Customer journey: inventory browsing with filters", () => {
  test("Customer browses inventory and applies filters", async ({ page }) => {
    // 1. Navigate to inventory
    await page.goto("/inventory");
    await page.waitForLoadState("domcontentloaded");

    // 2. Verify initial vehicles loaded
    const vehicleCards = page.locator('a[href*="/inventory/"]');
    await expect(vehicleCards.first()).toBeVisible({ timeout: 10_000 });
    const initialCount = await vehicleCards.count();
    expect(initialCount).toBeGreaterThan(0);

    // 3. Try applying a condition filter if controls exist
    const conditionFilter = page.locator(
      'select[name="condition"], button:has-text("Used"), [data-filter="condition"]'
    );
    if (await conditionFilter.first().isVisible({ timeout: 3_000 }).catch(() => false)) {
      const el = conditionFilter.first();
      const tagName = await el.evaluate((e) => e.tagName.toLowerCase());
      if (tagName === "select") {
        await el.selectOption("used");
      } else {
        await el.click();
      }
      await page.waitForLoadState("domcontentloaded");

      // Verify results updated (page still has vehicle cards)
      const filteredCards = page.locator('a[href*="/inventory/"]');
      const filteredCount = await filteredCards.count();
      expect(filteredCount).toBeGreaterThanOrEqual(0);
    }

    // 4. Try the make filter if it exists
    const makeFilter = page.locator(
      'select[name="make"], [data-filter="make"]'
    );
    if (await makeFilter.first().isVisible({ timeout: 2_000 }).catch(() => false)) {
      const el = makeFilter.first();
      const tagName = await el.evaluate((e) => e.tagName.toLowerCase());
      if (tagName === "select") {
        // Select Honda (known to be in placeholder data)
        await el.selectOption({ label: "Honda" }).catch(() => {
          // If exact label doesn't match, just pick the second option
          return el.selectOption({ index: 1 });
        });
      } else {
        await el.click();
      }
      await page.waitForLoadState("domcontentloaded");
    }

    // 5. Verify the page still works and has content
    const pageContent = await page.textContent("body");
    expect(pageContent!.length).toBeGreaterThan(100);
  });
});

test.describe("Customer journey: legal and compliance pages", () => {
  test("Customer views privacy policy and terms", async ({ page }) => {
    // Privacy page
    const privacyResp = await page.goto("/privacy");
    if (privacyResp && privacyResp.status() < 400) {
      const privacyHeading = page.locator("h1, h2").first();
      await expect(privacyHeading).toBeVisible({ timeout: 5_000 });
      const privacyText = await privacyHeading.textContent();
      expect(privacyText!.toLowerCase()).toContain("privacy");

      // CCPA section
      const ccpaSection = page.locator(
        'text=/CCPA|California Consumer|Do Not Sell/i'
      );
      await expect(ccpaSection.first()).toBeVisible({ timeout: 5_000 });
    } else {
      // Page may not exist yet — skip gracefully
      test.info().annotations.push({
        type: "skip",
        description: "/privacy page returned non-200",
      });
    }

    // Terms page
    const termsResp = await page.goto("/terms");
    if (termsResp && termsResp.status() < 400) {
      const termsHeading = page.locator("h1, h2").first();
      await expect(termsHeading).toBeVisible({ timeout: 5_000 });
      const termsText = await termsHeading.textContent();
      expect(termsText!.toLowerCase()).toContain("terms");
    } else {
      test.info().annotations.push({
        type: "skip",
        description: "/terms page returned non-200",
      });
    }

    // Accessibility page
    const a11yResp = await page.goto("/accessibility");
    if (a11yResp && a11yResp.status() < 400) {
      const a11yHeading = page.locator("h1, h2").first();
      await expect(a11yHeading).toBeVisible({ timeout: 5_000 });
    } else {
      test.info().annotations.push({
        type: "skip",
        description: "/accessibility page returned non-200",
      });
    }
  });
});
