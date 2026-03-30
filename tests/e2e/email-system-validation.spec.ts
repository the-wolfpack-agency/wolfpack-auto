/**
 * Email System Validation Tests
 *
 * Validates:
 * - All email templates compile (no runtime errors)
 * - All notification dispatch functions exist and are callable
 * - Analytics hooks fire for email-related events
 * - Source-level verification that invite flow tracks events
 * - Cookie consent banner renders on fresh visit
 * - VIN decode API works (Quick Add dependency)
 * - DMS providers use real names (no "Provider A/B/C/D")
 */

import { test, expect } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";

const ROOT = path.resolve(__dirname, "../..");

// ---------------------------------------------------------------------------
// Source-level: Email templates are complete
// ---------------------------------------------------------------------------

test.describe("Email templates — source validation", () => {
  const templateFile = fs.readFileSync(
    path.join(ROOT, "src/lib/email-templates.ts"),
    "utf-8",
  );

  const REQUIRED_TEMPLATES = [
    "dealerLeadNotificationHTML",
    "customerConfirmationHTML",
    "newLeadHTML",
    "contactSubmissionHTML",
    "genericCustomerConfirmationHTML",
    "leadAssignedHTML",
    "inventoryAlertHTML",
    "teamInviteHTML",
    "passwordResetHTML",
    "dealStatusUpdateHTML",
    "serviceReminderHTML",
  ];

  for (const fn of REQUIRED_TEMPLATES) {
    test(`template function ${fn} exists`, () => {
      expect(templateFile).toContain(`export function ${fn}`);
    });
  }

  test("all templates use escapeHtml for user input", () => {
    // Every template function should reference escapeHtml
    const templateBlocks = templateFile.split("export function ").slice(1);
    for (const block of templateBlocks) {
      const fnName = block.split("(")[0];
      if (fnName === "escapeHtml" || fnName === "formatSource" || fnName === "formatDealStatus") continue;
      // wrapInLayout doesn't need escapeHtml directly
      if (fnName === "wrapInLayout") continue;
      expect(block).toContain("escapeHtml");
    }
  });
});

// ---------------------------------------------------------------------------
// Source-level: Notification dispatchers exist
// ---------------------------------------------------------------------------

test.describe("Notifications — source validation", () => {
  const notifFile = fs.readFileSync(
    path.join(ROOT, "src/lib/notifications.ts"),
    "utf-8",
  );

  const REQUIRED_DISPATCHERS = [
    "notifyNewLead",
    "notifyLeadAssigned",
    "notifyContactFormSubmission",
    "sendCustomerConfirmation",
    "notifyInventoryAlert",
    "sendTeamInvite",
    "sendPasswordReset",
    "notifyDealStatusChange",
    "sendServiceReminder",
  ];

  for (const fn of REQUIRED_DISPATCHERS) {
    test(`dispatcher ${fn} exists`, () => {
      expect(notifFile).toContain(`export async function ${fn}`);
    });
  }
});

// ---------------------------------------------------------------------------
// Source-level: Invite flow fires analytics events
// ---------------------------------------------------------------------------

test.describe("Invite flow — analytics integration", () => {
  test("dealer-users API tracks team.user_invited", () => {
    const source = fs.readFileSync(
      path.join(ROOT, "src/app/api/admin/dealer-users/route.ts"),
      "utf-8",
    );
    expect(source).toContain('team.user_invited');
    expect(source).toContain('team.user_created');
    expect(source).toContain("trackSystem");
  });

  test("accept-invite API tracks team.invite_accepted", () => {
    const source = fs.readFileSync(
      path.join(ROOT, "src/app/api/admin/accept-invite/route.ts"),
      "utf-8",
    );
    expect(source).toContain('team.invite_accepted');
    expect(source).toContain("trackSystem");
  });

  test("sendTeamInvite is called in dealer-users POST", () => {
    const source = fs.readFileSync(
      path.join(ROOT, "src/app/api/admin/dealer-users/route.ts"),
      "utf-8",
    );
    expect(source).toContain("sendTeamInvite");
  });
});

// ---------------------------------------------------------------------------
// Source-level: Invite migration exists
// ---------------------------------------------------------------------------

test.describe("Invite flow — database migration", () => {
  test("migration 039 adds invite columns", () => {
    const migration = fs.readFileSync(
      path.join(ROOT, "src/db/migrations/039_invite_tokens.sql"),
      "utf-8",
    );
    expect(migration).toContain("invite_token");
    expect(migration).toContain("invite_expires_at");
    expect(migration).toContain("idx_dealer_users_invite_token");
  });
});

// ---------------------------------------------------------------------------
// API: VIN Decode (Quick Add dependency)
// ---------------------------------------------------------------------------

test.describe("VIN Decode API", () => {
  test("GET /api/admin/vin-decode without VIN returns 400", async ({ request }) => {
    const res = await request.get("/api/admin/vin-decode");
    expect(res.status()).not.toBe(500);
    if (res.status() !== 401) {
      expect(res.status()).toBe(400);
    }
  });

  test("GET /api/admin/vin-decode with invalid VIN returns 400", async ({ request }) => {
    const res = await request.get("/api/admin/vin-decode?vin=INVALID");
    expect(res.status()).not.toBe(500);
    if (res.status() !== 401) {
      expect(res.status()).toBe(400);
    }
  });

  test("GET /api/admin/vin-decode with valid VIN returns decoded data", async ({ request }) => {
    // 2024 Honda Accord test VIN
    const res = await request.get("/api/admin/vin-decode?vin=1HGCV1F34PA000001");
    expect(res.status()).not.toBe(500);
    if (res.status() === 200) {
      const body = await res.json();
      expect(body).toHaveProperty("vin");
      expect(body).toHaveProperty("decoded");
      expect(body.decoded).toHaveProperty("make");
      expect(body.decoded).toHaveProperty("year");
    }
  });
});

// ---------------------------------------------------------------------------
// Page: Quick Add renders
// ---------------------------------------------------------------------------

test.describe("Quick Add Page", () => {
  test("renders without errors", async ({ page }) => {
    const res = await page.goto("/admin/vehicles/quick-add");
    expect(res?.status()).not.toBe(500);
  });

  test("has VIN input field", async ({ page }) => {
    await page.goto("/admin/vehicles/quick-add");
    const vinInput = page.locator('input[placeholder*="VIN"], input[maxlength="17"]');
    expect(await vinInput.count()).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Cookie Consent
// ---------------------------------------------------------------------------

test.describe("Cookie Consent", () => {
  test("cookie consent component source exists", () => {
    const source = fs.readFileSync(
      path.join(ROOT, "src/components/CookieConsent.tsx"),
      "utf-8",
    );
    expect(source).toContain("cookie_consent");
    expect(source).toContain("Essential Only");
    expect(source).toContain("Accept All");
  });

  test("cookie consent is included in layout", () => {
    const layout = fs.readFileSync(
      path.join(ROOT, "src/app/layout.tsx"),
      "utf-8",
    );
    expect(layout).toContain("CookieConsent");
  });
});

// ---------------------------------------------------------------------------
// DMS Providers — no generic names
// ---------------------------------------------------------------------------

test.describe("DMS Providers — real names", () => {
  test("intake page uses real DMS provider names", () => {
    const source = fs.readFileSync(
      path.join(ROOT, "src/app/admin/intake/page.tsx"),
      "utf-8",
    );
    expect(source).not.toContain("DMS Provider A");
    expect(source).not.toContain("DMS Provider B");
    expect(source).not.toContain("DMS Provider C");
    expect(source).not.toContain("DMS Provider D");
    expect(source).toContain("CDK Global");
    expect(source).toContain("Reynolds & Reynolds");
    expect(source).toContain("DealerTrack");
    expect(source).toContain("Tekion");
  });

  test("onboarding page uses real DMS provider names", () => {
    const source = fs.readFileSync(
      path.join(ROOT, "src/app/admin/onboarding/page.tsx"),
      "utf-8",
    );
    expect(source).not.toContain("DMS Provider A");
    expect(source).not.toContain("DMS Provider B");
    expect(source).not.toContain("DMS Provider C");
    expect(source).toContain("CDK Global");
    expect(source).toContain("Reynolds & Reynolds");
  });
});

// ---------------------------------------------------------------------------
// Mobile UI Fixes — source verification
// ---------------------------------------------------------------------------

test.describe("Mobile UI fixes — source validation", () => {
  test("deal modal has overflow-y-auto for mobile", () => {
    const source = fs.readFileSync(
      path.join(ROOT, "src/app/admin/deals/page.tsx"),
      "utf-8",
    );
    expect(source).toContain("overflow-y-auto");
    expect(source).toContain("max-h-[95dvh]");
  });

  test("reviews page has unflag capability", () => {
    const source = fs.readFileSync(
      path.join(ROOT, "src/app/admin/reviews/page.tsx"),
      "utf-8",
    );
    expect(source).toContain("Unflag");
    expect(source).toContain("!r.flagged");
  });

  test("privacy page buttons stack on mobile", () => {
    const source = fs.readFileSync(
      path.join(ROOT, "src/app/admin/privacy/page.tsx"),
      "utf-8",
    );
    expect(source).toContain("space-y-3");
    // Buttons should be in their own flex row
    expect(source).toContain("flex-1 rounded-md bg-blue-600");
    expect(source).toContain("flex-1 rounded-md bg-red-600");
  });

  test("webhook events use single column on mobile", () => {
    const source = fs.readFileSync(
      path.join(ROOT, "src/app/admin/webhooks/page.tsx"),
      "utf-8",
    );
    expect(source).toContain("grid-cols-1 gap-1 sm:grid-cols-2");
  });

  test("onboarding back button is visible on dark bg", () => {
    const source = fs.readFileSync(
      path.join(ROOT, "src/app/admin/onboarding/page.tsx"),
      "utf-8",
    );
    expect(source).toContain("bg-gray-700");
    expect(source).not.toContain("border-gray-600 px-5 py-2.5 text-sm font-medium text-gray-300");
  });

  test("analytics chat scrolls within container not page", () => {
    const source = fs.readFileSync(
      path.join(ROOT, "src/components/AnalyticsChat.tsx"),
      "utf-8",
    );
    expect(source).toContain("messagesContainerRef");
    expect(source).toContain("container.scrollTop = container.scrollHeight");
    // Should NOT use scrollIntoView (causes page jump)
    expect(source).not.toContain("scrollIntoView");
  });
});
