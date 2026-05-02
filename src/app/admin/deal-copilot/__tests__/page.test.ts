/**
 * UI structure tests for /admin/deal-copilot.
 *
 * Without @testing-library/react in the repo's devDeps, the UI layer is
 * validated structurally: the page file exists, declares the testid hooks
 * the E2E spec relies on, posts to every API verb the routes implement,
 * and surfaces both success and error envelopes. Renders themselves are
 * exercised by the Playwright spec at tests/e2e/deal-copilot.spec.ts.
 */

import { existsSync, readFileSync } from "fs";
import { resolve } from "path";

const PAGE = resolve(__dirname, "../page.tsx");
const SOURCE = readFileSync(PAGE, "utf-8");

describe("/admin/deal-copilot — UI structure", () => {
  it("page file exists", () => {
    expect(existsSync(PAGE)).toBe(true);
  });

  it("is a client component", () => {
    expect(SOURCE).toMatch(/^"use client";/);
  });

  it("declares the data-testid hooks E2E and contract tests rely on", () => {
    const REQUIRED_TESTIDS = [
      "deal-copilot-page",
      "copilot-deal-form",
      "copilot-suggestions-panel",
      "open-session-btn",
      "generate-btn",
      "accept-btn",
      "reject-btn",
      "close-won-btn",
      "close-lost-btn",
      "outcome-capture",
      "deal-id-input",
      "selling-price-input",
    ];
    for (const id of REQUIRED_TESTIDS) {
      expect(SOURCE).toContain(`data-testid="${id}"`);
    }
  });

  it("groups suggestions by suggestion_type with a per-type testid", () => {
    expect(SOURCE).toContain("`copilot-group-${type}`");
  });

  it("calls every copilot API endpoint", () => {
    const REQUIRED_FETCHES = [
      "/api/admin/deal-copilot/sessions",
      "/sessions/${session.id}/suggest",
      "/sessions/${session.id}/close",
      "/suggestions/${id}/accept",
      "/suggestions/${id}/reject",
    ];
    for (const url of REQUIRED_FETCHES) {
      expect(SOURCE).toContain(url);
    }
  });

  it("renders evidence cite (plain language) on every suggestion card", () => {
    expect(SOURCE).toContain("suggestion.evidence.cite");
  });

  it("uses dealer-friendly copy, not raw signal names", () => {
    // Copy guardrail — internal field names like apr_delta / lender_id must
    // not show up as visible labels.
    expect(SOURCE).not.toMatch(/>\s*apr_delta\s*</);
    expect(SOURCE).not.toMatch(/>\s*lender_id\s*</);
  });

  it("captures outcome with close_reason and gross_profit before closing", () => {
    expect(SOURCE).toMatch(/close_reason/);
    expect(SOURCE).toMatch(/gross_profit_cents/);
  });

  it("surfaces both error and status envelopes", () => {
    expect(SOURCE).toContain('data-testid="copilot-error"');
    expect(SOURCE).toContain('data-testid="copilot-status"');
  });

  it("renders responsive (mobile + desktop) layout", () => {
    expect(SOURCE).toMatch(/grid-cols-1\s+md:grid-cols-2/);
  });
});
