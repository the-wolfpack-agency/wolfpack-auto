/**
 * wolfpack-auto verify smoke test.
 *
 * Distinct from the marketing-pages smoke at tests/smoke.spec.ts — this one
 * targets the admin surface + OpenAPI JSON and is run by `npm run verify`.
 *
 * Asserts per-route:
 *   - HTTP 200 on page load
 *   - Zero CSP violations in console during load + 3s idle
 *   - Zero 401/403/5xx XHR/fetch responses
 *   - Known text fragment visible (page is not blank)
 */
import { test, expect } from "@playwright/test";
import {
  probePath,
  resolveSmokeTarget,
  signInIfPossible,
  type SmokeProbe,
} from "./helpers/smoke-helpers";

const target = resolveSmokeTarget();

const PROBES: SmokeProbe[] = [
  { path: "/", expectText: "Wolfpack" },
  { path: "/admin", expectText: "Dashboard" },
  { path: "/admin/getting-started", expectText: "Getting Started" },
  { path: "/admin/onboarding", expectText: "Onboarding" },
  { path: "/security-posture", expectText: "Security" },
  { path: "/api/openapi", expectText: "", json: true },
];

// Routes that do not require an auth session.
const PUBLIC_PATHS = new Set<string>(["/", "/api/openapi"]);

test.describe("verify smoke (admin + openapi)", () => {
  test.beforeAll(() => {
    if (!target.isProduction) {
      console.log(`[smoke] PROD_URL not set; using ${target.baseUrl}`);
    }
  });

  test("public routes render cleanly", async ({ page }) => {
    for (const probe of PROBES.filter((p) => PUBLIC_PATHS.has(p.path))) {
      await probePath(page, target, probe);
    }
  });

  test("admin routes render cleanly (requires credentials)", async ({ page }) => {
    const adminProbes = PROBES.filter((p) => !PUBLIC_PATHS.has(p.path));
    if (adminProbes.length === 0) return;
    if (!target.email || !target.password) {
      test.skip(
        true,
        "SMOKE_TEST_EMAIL / SMOKE_TEST_PASSWORD not set; skipping admin smoke.",
      );
      return;
    }

    const signedIn = await signInIfPossible(page, target);
    expect(signedIn, "sign-in was attempted").toBe(true);

    for (const probe of adminProbes) {
      await probePath(page, target, probe);
    }
  });
});
