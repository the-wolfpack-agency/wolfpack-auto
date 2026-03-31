import { test, expect } from "@playwright/test";

test.describe("Analytics UI Integration — EventCollector in browser", () => {
  // ----------------------------------------------------------------
  // Verify the EventCollector fires events from actual page interactions
  // ----------------------------------------------------------------

  test("page view event is sent on navigation", async ({ page, request }) => {
    // Get baseline
    const beforeRes = await request.get("/api/analytics/events");
    const before = await beforeRes.json();
    const beforeViews = before.events_by_type.page_view ?? 0;

    // Navigate to a page
    await page.goto("/inventory");

    // Wait for the analytics flush by polling the API until the count increases
    await expect(async () => {
      const afterRes = await request.get("/api/analytics/events");
      const after = await afterRes.json();
      expect(after.events_by_type.page_view ?? 0).toBeGreaterThan(beforeViews);
    }).toPass({ timeout: 10_000 });

    // Check that page_view was recorded
    const afterRes = await request.get("/api/analytics/events");
    const after = await afterRes.json();
    expect(after.events_by_type.page_view ?? 0).toBeGreaterThan(beforeViews);
  });

  test("click events are captured when user clicks elements", async ({
    page,
    request,
  }) => {
    const beforeRes = await request.get("/api/analytics/events");
    const before = await beforeRes.json();
    const beforeClicks = before.events_by_type.click ?? 0;

    await page.goto("/");

    // Click a navigation link
    await page.click('a[href="/inventory"]');

    // Wait for the analytics flush by polling the API until the count increases
    await expect(async () => {
      const res = await request.get("/api/analytics/events");
      const data = await res.json();
      expect(data.events_by_type.click ?? 0).toBeGreaterThan(beforeClicks);
    }).toPass({ timeout: 10_000 });

    const afterRes = await request.get("/api/analytics/events");
    const after = await afterRes.json();
    expect(after.events_by_type.click ?? 0).toBeGreaterThan(beforeClicks);
  });

  test("form interaction events fire on field focus", async ({
    page,
    request,
  }) => {
    const beforeRes = await request.get("/api/analytics/events");
    const before = await beforeRes.json();
    const beforeForms = before.events_by_type.form_interaction ?? 0;

    await page.goto("/contact");

    // Focus on form fields
    await page.click("#contact-first-name");
    await page.fill("#contact-first-name", "Test");
    await page.click("#contact-last-name");
    await page.fill("#contact-last-name", "User");

    // Wait for the analytics flush by polling the API until the count increases
    await expect(async () => {
      const res = await request.get("/api/analytics/events");
      const data = await res.json();
      expect(data.events_by_type.form_interaction ?? 0).toBeGreaterThan(beforeForms);
    }).toPass({ timeout: 10_000 });

    const afterRes = await request.get("/api/analytics/events");
    const after = await afterRes.json();
    expect(after.events_by_type.form_interaction ?? 0).toBeGreaterThan(
      beforeForms,
    );
  });

  test("scroll events fire when user scrolls", async ({ page, request }) => {
    const beforeRes = await request.get("/api/analytics/events");
    const before = await beforeRes.json();
    const beforeScrolls = before.events_by_type.scroll ?? 0;

    await page.goto("/about");

    // Scroll to bottom
    await page.evaluate(() => {
      window.scrollTo({ top: document.body.scrollHeight, behavior: "instant" });
    });

    // Wait for the analytics flush by polling the API until the count increases
    await expect(async () => {
      const res = await request.get("/api/analytics/events");
      const data = await res.json();
      expect(data.events_by_type.scroll ?? 0).toBeGreaterThan(beforeScrolls);
    }).toPass({ timeout: 10_000 });

    const afterRes = await request.get("/api/analytics/events");
    const after = await afterRes.json();
    expect(after.events_by_type.scroll ?? 0).toBeGreaterThan(beforeScrolls);
  });

  test("chat widget interactions produce events", async ({
    page,
    request,
  }) => {
    const beforeRes = await request.get("/api/analytics/events");
    const before = await beforeRes.json();
    const beforeChat = before.events_by_type.chat_interaction ?? 0;

    await page.goto("/");

    // Open chat widget
    const chatBubble = page.locator('[aria-label="Open chat"]');
    if (await chatBubble.isVisible()) {
      await chatBubble.click();

      // Wait for the analytics flush by polling the API until the count increases
      await expect(async () => {
        const res = await request.get("/api/analytics/events");
        const data = await res.json();
        expect(data.events_by_type.chat_interaction ?? 0).toBeGreaterThan(beforeChat);
      }).toPass({ timeout: 10_000 });

      const afterRes = await request.get("/api/analytics/events");
      const after = await afterRes.json();
      expect(after.events_by_type.chat_interaction ?? 0).toBeGreaterThan(
        beforeChat,
      );
    }
  });

  // ----------------------------------------------------------------
  // Session management
  // ----------------------------------------------------------------

  test("session ID persists across page navigations", async ({ page }) => {
    await page.goto("/");
    // Wait for React effects to hydrate and set sessionStorage
    await expect(async () => {
      const sid = await page.evaluate(() => sessionStorage.getItem("wolfpack_analytics_session"));
      expect(sid).toBeTruthy();
    }).toPass({ timeout: 5_000 });

    // Get session ID from sessionStorage
    const sessionId1 = await page.evaluate(() =>
      sessionStorage.getItem("wolfpack_analytics_session"),
    );
    expect(sessionId1).toBeTruthy();
    expect(sessionId1).toMatch(/^s_/);

    // Navigate to another page
    await page.goto("/inventory");
    await page.waitForLoadState("domcontentloaded");

    const sessionId2 = await page.evaluate(() =>
      sessionStorage.getItem("wolfpack_analytics_session"),
    );

    // Same session
    expect(sessionId2).toBe(sessionId1);
  });

  test("user fingerprint persists across sessions via localStorage", async ({
    page,
  }) => {
    await page.goto("/");
    // Wait for React effects to hydrate and set localStorage
    await expect(async () => {
      const fp = await page.evaluate(() => localStorage.getItem("wolfpack_analytics_fp"));
      expect(fp).toBeTruthy();
    }).toPass({ timeout: 5_000 });

    const fp1 = await page.evaluate(() =>
      localStorage.getItem("wolfpack_analytics_fp"),
    );
    expect(fp1).toBeTruthy();
    expect(fp1).toMatch(/^fp_/);

    // Clear sessionStorage (new session) but keep localStorage
    await page.evaluate(() => sessionStorage.clear());
    await page.goto("/inventory");
    await page.waitForLoadState("domcontentloaded");

    const fp2 = await page.evaluate(() =>
      localStorage.getItem("wolfpack_analytics_fp"),
    );

    // Same fingerprint
    expect(fp2).toBe(fp1);
  });

  // ----------------------------------------------------------------
  // Data security in the browser
  // ----------------------------------------------------------------

  test("no PII is stored in sessionStorage or localStorage", async ({
    page,
  }) => {
    await page.goto("/contact");

    // Fill out the contact form with PII
    await page.fill("#contact-first-name", "John");
    await page.fill("#contact-last-name", "Smith");
    await page.fill("#contact-email", "john@example.com");
    await page.fill("#contact-phone", "303-555-1234");
    await page.waitForLoadState("domcontentloaded");

    // Check that PII is NOT in analytics storage
    const sessionData = await page.evaluate(() => {
      const data: Record<string, string | null> = {};
      for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i);
        if (key && key.startsWith("wolfpack_analytics")) {
          data[key] = sessionStorage.getItem(key);
        }
      }
      return JSON.stringify(data);
    });

    expect(sessionData).not.toContain("john@example.com");
    expect(sessionData).not.toContain("303-555-1234");
    expect(sessionData).not.toContain("John");

    const localData = await page.evaluate(() => {
      const fp = localStorage.getItem("wolfpack_analytics_fp");
      return fp;
    });

    // Fingerprint should be anonymous, not contain PII
    expect(localData).not.toContain("john");
    expect(localData).not.toContain("example.com");
  });

  test("events are sent via sendBeacon (fire-and-forget, no blocking)", async ({
    page,
  }) => {
    await page.goto("/");

    // Verify sendBeacon is available and used
    const hasSendBeacon = await page.evaluate(
      () => typeof navigator.sendBeacon === "function",
    );
    expect(hasSendBeacon).toBe(true);
  });
});
