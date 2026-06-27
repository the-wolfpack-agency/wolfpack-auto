/**
 * SECURITY REGRESSION — DEMO_MODE must enable the demo *login*, never bypass auth.
 *
 * The platform scan flagged 8 critical findings on the deployed wolfpack-auto:
 * every /admin route + /api/admin endpoint served content (real lead PII) to
 * unauthenticated requests. Root cause: DEMO_MODE=true (1) short-circuited the
 * middleware admin gate via `!isDemoMode &&`, and (2) made requireAuth() return
 * a synthetic admin user with no session.
 *
 * Fix: DEMO_MODE only keeps the demo credential (demo@wolfpackauto.com / demo)
 * active in src/lib/auth.ts. The middleware gate and requireAuth() always enforce
 * a real session. These tests lock that in so the bypass cannot return.
 */
import { readFileSync } from "fs";
import { join } from "path";

const read = (rel: string) => readFileSync(join(__dirname, rel), "utf-8");

describe("DEMO_MODE never bypasses authentication (source guardrails)", () => {
  it("auth-guard.ts does NOT return a synthetic user gated on DEMO_MODE", () => {
    const src = read("../auth-guard.ts");
    // The old bypass shape: `if (process.env.DEMO_MODE === "true") { return { user`
    expect(src).not.toMatch(
      /DEMO_MODE\s*===\s*"true"\s*\)\s*\{[\s\S]{0,120}return\s*\{[\s\S]{0,40}user/,
    );
    // requireAuth must always reach the real session check.
    expect(src).toContain("getServerSession(authOptions)");
  });

  it("middleware.ts gates /admin regardless of DEMO_MODE", () => {
    const src = read("../../middleware.ts");
    // The admin auth check must not be guarded by a DEMO_MODE escape hatch.
    expect(src).not.toMatch(/!isDemoMode\s*&&\s*isAdminRoute/);
    expect(src).not.toMatch(/const\s+isDemoMode\s*=/);
    // The token-based gate is still present.
    expect(src).toContain("getToken");
    expect(src).toMatch(/if\s*\(\s*isAdminRoute\(pathname\)/);
  });

  it("demo credential maps to the seeded dealer tenant, not the unmapped 'demo-dealer'", () => {
    const src = read("../auth.ts");
    // The demo credential still exists (so the gated demo is loginable).
    expect(src).toMatch(/demo@wolfpackauto\.com/);
    // ...but its session dealer_id resolves to the real seeded tenant so the
    // demo shows data (getDealerId returns a set dealer_id verbatim).
    expect(src).toMatch(/dealer_id:\s*[\s\S]{0,20}process\.env\.DEALER_ID/);
  });
});

describe("requireAuth behavioral — 401 without a session even when DEMO_MODE=true", () => {
  const ORIGINAL = process.env.DEMO_MODE;
  afterEach(() => {
    process.env.DEMO_MODE = ORIGINAL;
    jest.resetModules();
    jest.dontMock("next-auth");
    jest.dontMock("@/lib/analytics-hooks");
  });

  it("returns a 401 response, not a synthetic user", async () => {
    process.env.DEMO_MODE = "true";
    jest.resetModules();
    jest.doMock("next-auth", () => ({ getServerSession: jest.fn(async () => null) }));
    jest.doMock("@/lib/analytics-hooks", () => ({
      trackSecurity: jest.fn(async () => undefined),
    }));

    // eslint-disable-next-line @typescript-eslint/no-require-imports -- dynamic load after jest.doMock
    const { requireAuth } = require("@/lib/auth-guard");
    const result = await requireAuth();

    // A bypass would return `{ user: {...} }`. The fix returns a NextResponse 401.
    expect(result).not.toHaveProperty("user");
    expect(result.status).toBe(401);
  });
});
