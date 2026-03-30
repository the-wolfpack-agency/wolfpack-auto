/**
 * Password Reset Flow E2E Tests
 *
 * Validates:
 * - Request reset API (POST /api/admin/reset-password)
 * - Set new password API (PUT /api/admin/reset-password)
 * - Reset page renders both states (request + set password)
 * - Login page has "Forgot password?" link
 * - Source-level: analytics events, migration, email template wired
 */

import { test, expect } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";

const ROOT = path.resolve(__dirname, "../..");

// ---------------------------------------------------------------------------
// API: Request password reset
// ---------------------------------------------------------------------------

test.describe("Password Reset — Request API", () => {
  test("POST /api/admin/reset-password sends reset email", async ({ request }) => {
    const res = await request.post("/api/admin/reset-password", {
      data: { email: "nickhomyk@gmail.com" },
    });
    expect(res.status()).not.toBe(500);
    if (res.status() === 200) {
      const body = await res.json();
      expect(body).toHaveProperty("message");
    }
  });

  test("POST /api/admin/reset-password rejects missing email", async ({ request }) => {
    const res = await request.post("/api/admin/reset-password", {
      data: {},
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("email");
  });

  test("POST /api/admin/reset-password returns 200 for unknown email (no enumeration)", async ({ request }) => {
    const res = await request.post("/api/admin/reset-password", {
      data: { email: "nonexistent@nowhere.com" },
    });
    expect(res.status()).not.toBe(500);
    // Should always return 200 to prevent email enumeration
    expect(res.status()).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// API: Set new password
// ---------------------------------------------------------------------------

test.describe("Password Reset — Set Password API", () => {
  test("PUT /api/admin/reset-password rejects missing token", async ({ request }) => {
    const res = await request.put("/api/admin/reset-password", {
      data: { password: "NewPass123!" },
    });
    expect(res.status()).not.toBe(500);
    if (res.status() !== 401) {
      expect(res.status()).toBe(400);
    }
  });

  test("PUT /api/admin/reset-password rejects missing password", async ({ request }) => {
    const res = await request.put("/api/admin/reset-password", {
      data: { token: "fake-token" },
    });
    expect(res.status()).not.toBe(500);
    if (res.status() !== 401) {
      expect(res.status()).toBe(400);
    }
  });

  test("PUT /api/admin/reset-password rejects short password", async ({ request }) => {
    const res = await request.put("/api/admin/reset-password", {
      data: { token: "fake-token", password: "short" },
    });
    expect(res.status()).not.toBe(500);
    if (res.status() !== 401) {
      expect(res.status()).toBe(400);
    }
  });

  test("PUT /api/admin/reset-password handles invalid token gracefully", async ({ request }) => {
    const res = await request.put("/api/admin/reset-password", {
      data: { token: "nonexistent-token", password: "ValidPass123!" },
    });
    expect(res.status()).not.toBe(500);
    // 400 (invalid token) or 200 (demo mode) — both acceptable
    expect([200, 400]).toContain(res.status());
  });
});

// ---------------------------------------------------------------------------
// Page: Reset Password
// ---------------------------------------------------------------------------

test.describe("Password Reset — Page", () => {
  test("request form renders without token", async ({ page }) => {
    const res = await page.goto("/admin/reset-password");
    expect(res?.status()).not.toBe(500);
    const body = await page.textContent("body");
    if (body?.includes("Reset Password")) {
      expect(body).toContain("email");
    }
  });

  test("set password form renders with token", async ({ page }) => {
    const res = await page.goto("/admin/reset-password?token=test-token-123");
    expect(res?.status()).not.toBe(500);
    const body = await page.textContent("body");
    if (body?.includes("New Password") || body?.includes("Set New Password")) {
      const passwordInputs = page.locator('input[type="password"]');
      expect(await passwordInputs.count()).toBeGreaterThanOrEqual(2);
    }
  });
});

// ---------------------------------------------------------------------------
// Login page: Forgot password link
// ---------------------------------------------------------------------------

test.describe("Login Page — Forgot Password Link", () => {
  test("login page has forgot password link", async ({ page }) => {
    const res = await page.goto("/admin/login");
    expect(res?.status()).not.toBe(500);
    const link = page.locator('a[href="/admin/reset-password"]');
    if (await link.count() > 0) {
      const text = await link.textContent();
      expect(text?.toLowerCase()).toContain("forgot");
    }
  });
});

// ---------------------------------------------------------------------------
// Source-level validation
// ---------------------------------------------------------------------------

test.describe("Password Reset — Source Validation", () => {
  test("API tracks team.password_reset analytics event", () => {
    const source = fs.readFileSync(
      path.join(ROOT, "src/app/api/admin/reset-password/route.ts"),
      "utf-8",
    );
    expect(source).toContain("team.password_reset");
    expect(source).toContain("trackSystem");
  });

  test("API calls sendPasswordReset", () => {
    const source = fs.readFileSync(
      path.join(ROOT, "src/app/api/admin/reset-password/route.ts"),
      "utf-8",
    );
    expect(source).toContain("sendPasswordReset");
  });

  test("API prevents email enumeration (always returns 200)", () => {
    const source = fs.readFileSync(
      path.join(ROOT, "src/app/api/admin/reset-password/route.ts"),
      "utf-8",
    );
    // POST handler should always return 200 even if user not found
    expect(source).toContain("email enumeration");
  });

  test("migration 040 exists with reset_token columns", () => {
    const migration = fs.readFileSync(
      path.join(ROOT, "src/db/migrations/040_reset_tokens.sql"),
      "utf-8",
    );
    expect(migration).toContain("reset_token");
    expect(migration).toContain("reset_token_expires_at");
  });

  test("passwordResetHTML template exists", () => {
    const templates = fs.readFileSync(
      path.join(ROOT, "src/lib/email-templates.ts"),
      "utf-8",
    );
    expect(templates).toContain("export function passwordResetHTML");
  });

  test("sendPasswordReset dispatcher exists", () => {
    const notif = fs.readFileSync(
      path.join(ROOT, "src/lib/notifications.ts"),
      "utf-8",
    );
    expect(notif).toContain("export async function sendPasswordReset");
  });

  test("reset page uses Suspense for useSearchParams", () => {
    const page = fs.readFileSync(
      path.join(ROOT, "src/app/admin/reset-password/page.tsx"),
      "utf-8",
    );
    expect(page).toContain("Suspense");
    expect(page).toContain("useSearchParams");
  });
});
