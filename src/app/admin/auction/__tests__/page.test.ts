/**
 * UI structural tests for /admin/auction.
 *
 * Asserts the page source contains every render branch (Opportunities tab +
 * Benchmarks tab), action buttons, empty-state, and analytics-relevant strings.
 * Behavioral E2E lives in tests/e2e/auction-feed.spec.ts.
 */

import * as fs from "fs";
import * as path from "path";

const PAGE_PATH = path.join(__dirname, "..", "page.tsx");

let source: string;
beforeAll(() => {
  source = fs.readFileSync(PAGE_PATH, "utf-8");
});

describe("/admin/auction page", () => {
  it("is a client component", () => {
    expect(source.trim().startsWith('"use client"')).toBe(true);
  });

  it("has both tabs wired", () => {
    expect(source).toContain('data-testid="auction-tab-opportunities"');
    expect(source).toContain('data-testid="auction-tab-benchmarks"');
  });

  it("renders opportunities table with four action buttons per row", () => {
    expect(source).toContain('data-testid="opportunities-table"');
    expect(source).toMatch(/opp-bid-/);
    expect(source).toMatch(/opp-won-/);
    expect(source).toMatch(/opp-lost-/);
    expect(source).toMatch(/opp-dismiss-/);
  });

  it("renders empty-state for opportunities", () => {
    expect(source).toContain('data-testid="opportunities-empty"');
  });

  it("hits the right API for the action handler", () => {
    expect(source).toMatch(/\/api\/admin\/auction\/opportunities\/\$\{id\}\/\$\{action\}/);
  });

  it("hits the right API for opportunity list", () => {
    expect(source).toContain("/api/admin/auction/opportunities");
  });

  it("renders benchmark search inputs (vin/year/make/model/mileage)", () => {
    expect(source).toContain('data-testid="bench-vin"');
    expect(source).toContain('data-testid="bench-year"');
    expect(source).toContain('data-testid="bench-make"');
    expect(source).toContain('data-testid="bench-model"');
    expect(source).toContain('data-testid="bench-mileage"');
    expect(source).toContain('data-testid="bench-lookup"');
  });

  it("renders benchmark result with p25/p50/p75", () => {
    expect(source).toContain('data-testid="bench-result"');
    expect(source).toMatch(/P25/);
    expect(source).toMatch(/P50/);
    expect(source).toMatch(/P75/);
  });

  it("uses /api/admin/auction/benchmarks for lookup", () => {
    expect(source).toContain("/api/admin/auction/benchmarks?");
  });

  it("has admin page testid for E2E hooks", () => {
    expect(source).toContain('data-testid="admin-auction-page"');
  });
});
