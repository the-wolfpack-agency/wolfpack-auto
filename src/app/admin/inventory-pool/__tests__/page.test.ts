/**
 * UI structural tests for /admin/inventory-pool.
 *
 * Asserts page source covers all three tabs (Visible / Reservations / Swaps)
 * with their expected action buttons, empty states, and API endpoints.
 * Behavioral E2E lives in tests/e2e/inventory-pool.spec.ts.
 */

import * as fs from "fs";
import * as path from "path";

const PAGE_PATH = path.join(__dirname, "..", "page.tsx");

let source: string;
beforeAll(() => {
  source = fs.readFileSync(PAGE_PATH, "utf-8");
});

describe("/admin/inventory-pool page", () => {
  it("is a client component", () => {
    expect(source.trim().startsWith('"use client"')).toBe(true);
  });

  it("renders all three tabs", () => {
    expect(source).toContain('data-testid="pool-tab-visible"');
    expect(source).toContain('data-testid="pool-tab-reservations"');
    expect(source).toContain('data-testid="pool-tab-swaps"');
  });

  it("renders visible inventory table with Reserve action", () => {
    expect(source).toContain('data-testid="pool-visible-section"');
    expect(source).toContain('data-testid="pool-visible-table"');
    expect(source).toMatch(/pool-reserve-/);
  });

  it("renders empty state for visible tab", () => {
    expect(source).toContain('data-testid="pool-visible-empty"');
  });

  it("renders incoming reservations table with Approve+Reject action buttons", () => {
    expect(source).toMatch(/approve-/);
    expect(source).toMatch(/reject-/);
    expect(source).toContain('data-testid="incoming-empty"');
  });

  it("renders outgoing reservations and fulfill action", () => {
    expect(source).toContain('data-testid="outgoing-empty"');
    expect(source).toMatch(/fulfill-/);
  });

  it("renders swaps table with Accept+Reject", () => {
    expect(source).toContain('data-testid="pool-swaps-section"');
    expect(source).toMatch(/swap-accept-/);
    expect(source).toMatch(/swap-reject-/);
    expect(source).toContain('data-testid="swaps-empty"');
  });

  it("hits correct API endpoints", () => {
    expect(source).toContain("/api/admin/inventory-pool/visible");
    expect(source).toContain("/api/admin/inventory-pool/reserve");
    expect(source).toMatch(/\/api\/admin\/inventory-pool\/reservations\/\$\{id\}\/\$\{action\}/);
    expect(source).toContain("/api/admin/inventory-pool/swaps?dealer_group_id=");
    expect(source).toMatch(/\/api\/admin\/inventory-pool\/swaps\/\$\{id\}\/\$\{action\}/);
  });

  it("has admin page testid", () => {
    expect(source).toContain('data-testid="admin-inventory-pool-page"');
  });
});
