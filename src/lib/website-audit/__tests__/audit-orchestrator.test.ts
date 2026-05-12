/**
 * End-to-end orchestrator test in shadow mode (no DATABASE_URL).
 *
 * Uses scan + Lighthouse overrides to skip Playwright + Lighthouse entirely,
 * exercises the rule application + PDF + (no-op) email path, and verifies
 * the summary metrics shape.
 */

import { generateWebsiteAudit } from "@/lib/website-audit/audit-orchestrator";
import { ACME_SCAN, ACME_LIGHTHOUSE } from "@/lib/website-audit/__tests__/fixtures/acme-website-sample";

describe("generateWebsiteAudit (shadow mode)", () => {
  const originalDB = process.env.DATABASE_URL;
  const originalResend = process.env.RESEND_API_KEY;
  beforeAll(() => {
    delete process.env.DATABASE_URL;
    delete process.env.RESEND_API_KEY;
  });
  afterAll(() => {
    if (originalDB) process.env.DATABASE_URL = originalDB;
    if (originalResend) process.env.RESEND_API_KEY = originalResend;
  });

  test("happy path delivers, returns summary + triggered list", async () => {
    const result = await generateWebsiteAudit("shadow-run-id-1234", {
      __scanOverride: ACME_SCAN,
      __lighthouseOverride: ACME_LIGHTHOUSE,
      now: new Date("2026-05-12T00:00:00Z"),
    });
    expect(result.status).toBe("delivered");
    // mkdtemp-based randomized OS tmpdir path; just check the run ID is preserved.
    expect(result.pdf_url).toMatch(/^file:\/\/.*shadow-run-id-1234\.pdf$/);
    expect(result.summary_metrics).toBeDefined();
    const sm = result.summary_metrics as Record<string, unknown>;
    expect(typeof sm.overall_score).toBe("number");
    expect(typeof sm.triggered_count).toBe("number");
    expect(Array.isArray(sm.top_3_issues)).toBe(true);
    expect(typeof sm.headline).toBe("string");
    expect(result.triggered?.length).toBeGreaterThan(0);
  });
});
