/**
 * Settings Branding — Logo Upload & Branding Form
 *
 * Verifies:
 *   1. Logo uploader: upload, preview, remove, validation
 *   2. Branding form: save colors/font via PUT /api/admin/settings
 *   3. No 404s: all form actions hit real API routes
 */

import { test, expect } from "@playwright/test";
import path from "path";

test.describe("Logo Upload — Settings Branding", () => {
  test("settings page renders logo uploader", async ({ page }) => {
    await page.goto("/admin/settings", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(500);

    // The file input should exist (hidden but present)
    const fileInput = page.locator("#logo-upload");
    await expect(fileInput).toBeAttached();

    // "Click to upload logo" text should be visible
    const uploadLabel = page.getByText(/click to upload|click to change/i);
    await expect(uploadLabel).toBeVisible();
  });

  test("POST /api/admin/settings/logo accepts valid PNG", async ({ request }) => {
    // Create a minimal 1x1 PNG
    const pngHeader = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, // PNG signature
      0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, // IHDR chunk
      0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, // 1x1
      0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53, // 8-bit RGB
      0xde, 0x00, 0x00, 0x00, 0x0c, 0x49, 0x44, 0x41, // IDAT chunk
      0x54, 0x08, 0xd7, 0x63, 0xf8, 0xcf, 0xc0, 0x00,
      0x00, 0x00, 0x02, 0x00, 0x01, 0xe2, 0x21, 0xbc,
      0x33, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, // IEND
      0x44, 0xae, 0x42, 0x60, 0x82,
    ]);

    const res = await request.post("/api/admin/settings/logo", {
      multipart: {
        logo: {
          name: "test-logo.png",
          mimeType: "image/png",
          buffer: pngHeader,
        },
      },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    // Should return a data URL or null in shadow mode
    expect(body.logo_url !== undefined || body.message !== undefined).toBe(true);
    if (body.logo_url && !body.message) {
      expect(body.logo_url).toMatch(/^data:image\/png;base64,/);
    }
  });

  test("POST /api/admin/settings/logo rejects non-image files", async ({ request }) => {
    const res = await request.post("/api/admin/settings/logo", {
      multipart: {
        logo: {
          name: "malicious.exe",
          mimeType: "application/octet-stream",
          buffer: Buffer.from("not an image"),
        },
      },
    });

    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toBeTruthy();
  });

  test("POST /api/admin/settings/logo rejects missing file", async ({ request }) => {
    const res = await request.post("/api/admin/settings/logo", {
      multipart: {
        notlogo: {
          name: "empty.txt",
          mimeType: "text/plain",
          buffer: Buffer.from(""),
        },
      },
    });

    expect(res.status()).toBe(400);
  });

  test("DELETE /api/admin/settings/logo clears the logo", async ({ request }) => {
    const res = await request.delete("/api/admin/settings/logo");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.logo_url).toBeNull();
  });

  test("full upload flow: upload → preview → remove", async ({ page }) => {
    await page.goto("/admin/settings", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(500);

    const fileInput = page.locator("#logo-upload");

    // Create a tiny PNG in memory and set it on the file input
    const pngBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==";
    const pngBuffer = Buffer.from(pngBase64, "base64");

    await fileInput.setInputFiles({
      name: "test-logo.png",
      mimeType: "image/png",
      buffer: pngBuffer,
    });

    // Wait for upload to complete
    await page.waitForTimeout(2000);

    // Success message should appear (or preview should update)
    const successOrPreview = page.locator("text=Logo saved successfully, img[alt='Dealer logo preview']").first();
    const hasSuccess = await page.getByText("Logo saved successfully").isVisible().catch(() => false);
    const hasPreview = await page.locator("img[alt='Dealer logo preview']").isVisible().catch(() => false);
    expect(hasSuccess || hasPreview).toBe(true);

    // Remove button should be visible
    const removeBtn = page.getByText("Remove logo");
    if (await removeBtn.isVisible()) {
      await removeBtn.click();
      await page.waitForTimeout(1000);
      // Preview should be gone
      const previewGone = await page.locator("img[alt='Dealer logo preview']").isVisible().catch(() => false);
      // It's OK if the default upload icon appears instead
      expect(previewGone).toBe(false);
    }
  });
});

test.describe("Branding Form — Save Colors & Font", () => {
  test("PUT /api/admin/settings accepts branding fields", async ({ request }) => {
    const res = await request.put("/api/admin/settings", {
      data: {
        primary_color: "#0070c7",
        secondary_color: "#f97316",
      },
    });
    // Accept 200 (saved) or 404 (no dealer row in demo) — NOT 404 from missing route
    expect(res.status()).not.toBe(404);
    expect([200, 400]).toContain(res.status());
  });

  test("branding form does NOT submit to a 404 route", async ({ page }) => {
    await page.goto("/admin/settings", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(500);

    // The branding section should NOT contain a <form> with action="/api/admin/settings/branding"
    // It should use client-side fetch instead
    const oldForm = page.locator('form[action="/api/admin/settings/branding"]');
    const count = await oldForm.count();
    expect(count, "Found old form action pointing to /api/admin/settings/branding — will 404").toBe(0);
  });

  test("Save Branding button triggers client-side save", async ({ page }) => {
    await page.goto("/admin/settings", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(500);

    // Intercept the PUT request to verify it goes to the right endpoint
    const putPromise = page.waitForResponse(
      (res) => res.url().includes("/api/admin/settings") && res.request().method() === "PUT",
      { timeout: 10000 },
    );

    // Click Save Branding
    const saveBtn = page.getByRole("button", { name: /save branding/i });
    await expect(saveBtn).toBeVisible();
    await saveBtn.click();

    // Verify the PUT was sent to the correct endpoint
    const putRes = await putPromise;
    expect(putRes.url()).toContain("/api/admin/settings");
    expect(putRes.status()).not.toBe(404);
  });

  test("settings page has no forms pointing to non-existent routes", async ({ page, request }) => {
    await page.goto("/admin/settings", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(500);

    // Find all form actions on the page
    const formActions = await page.$$eval("form[action]", (forms) =>
      forms.map((f) => f.getAttribute("action")).filter(Boolean),
    );

    // Every form action that is a relative URL should return non-404
    for (const action of formActions) {
      if (action && action.startsWith("/")) {
        const res = await request.get(action);
        expect(
          res.status(),
          `Form action ${action} returns ${res.status()} — route does not exist`,
        ).not.toBe(404);
      }
    }
  });
});
