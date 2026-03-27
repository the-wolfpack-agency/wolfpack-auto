/**
 * seo-structured-data.spec.ts
 *
 * Shadow-hardening static analysis for JSON-LD structured data on the VDP and
 * the PaymentCalculator wiring on the financing page.
 *
 * Zero browser / zero network — all assertions read source files on disk.
 * Runs in < 1 s and is safe in CI with no DB or server.
 */

import { test, expect } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";

// ---------------------------------------------------------------------------
// Helpers (mirroring the pattern used in new-features-coverage.spec.ts)
// ---------------------------------------------------------------------------

const ROOT = path.resolve(__dirname, "../..");

function src(...parts: string[]): string {
  return path.join(ROOT, ...parts);
}

function read(...parts: string[]): string {
  const p = src(...parts);
  expect(fs.existsSync(p), `File must exist: ${p}`).toBe(true);
  return fs.readFileSync(p, "utf8");
}

// ---------------------------------------------------------------------------
// 1. VDP — JSON-LD Vehicle schema
// ---------------------------------------------------------------------------

test.describe("VDP JSON-LD Vehicle schema", () => {
  test("VDP page contains JSON-LD Vehicle schema @type", () => {
    const code = read("src/app/inventory/[vin]/page.tsx");
    expect(code).toMatch(/"@type":\s*"Vehicle"|schema\.org\/Vehicle/);
  });

  test("VDP page contains JSON-LD BreadcrumbList schema", () => {
    const code = read("src/app/inventory/[vin]/page.tsx");
    expect(code).toContain("BreadcrumbList");
  });

  test("VDP JSON-LD Vehicle schema includes brand, model, and mileageFromOdometer", () => {
    const code = read("src/app/inventory/[vin]/page.tsx");
    expect(code).toContain("brand");
    expect(code).toContain("model");
    expect(code).toContain("mileageFromOdometer");
  });

  test("VDP JSON-LD includes vehicleCondition mapping", () => {
    const code = read("src/app/inventory/[vin]/page.tsx");
    expect(code).toContain("vehicleCondition");
    expect(code).toContain("NewCondition");
    expect(code).toContain("UsedCondition");
  });

  test("VDP JSON-LD includes Offer with price and priceCurrency", () => {
    const code = read("src/app/inventory/[vin]/page.tsx");
    expect(code).toContain("Offer");
    expect(code).toContain("priceCurrency");
  });

  test("VDP JSON-LD BreadcrumbList includes Home, Inventory, and vehicle name items", () => {
    const code = read("src/app/inventory/[vin]/page.tsx");
    expect(code).toContain("ListItem");
    expect(code).toMatch(/"Home"|name.*Home/);
    expect(code).toMatch(/"Inventory"|name.*Inventory/);
  });

  test("VDP JSON-LD scripts are rendered via dangerouslySetInnerHTML", () => {
    const code = read("src/app/inventory/[vin]/page.tsx");
    expect(code).toContain('type="application/ld+json"');
    expect(code).toContain("dangerouslySetInnerHTML");
    expect(code).toContain("JSON.stringify");
  });
});

// ---------------------------------------------------------------------------
// 2. VDP — canonical URL in metadata
// ---------------------------------------------------------------------------

test.describe("VDP canonical URL in metadata", () => {
  test("VDP generateMetadata includes alternates with canonical", () => {
    const code = read("src/app/inventory/[vin]/page.tsx");
    expect(code).toMatch(/alternates|canonical/);
  });

  test("VDP canonical URL points to /inventory/[vin]", () => {
    const code = read("src/app/inventory/[vin]/page.tsx");
    expect(code).toMatch(/canonical.*inventory|inventory.*canonical/);
  });
});

// ---------------------------------------------------------------------------
// 3. Financing page — PaymentCalculator component wired
// ---------------------------------------------------------------------------

test.describe("Financing page PaymentCalculator integration", () => {
  test("Financing page imports PaymentCalculator component", () => {
    const code = read("src/app/financing/page.tsx");
    expect(code).toContain("PaymentCalculator");
  });

  test("Financing page renders PaymentCalculator in JSX", () => {
    const code = read("src/app/financing/page.tsx");
    expect(code).toMatch(/<PaymentCalculator/);
  });

  test("Financing page passes vehiclePrice prop to PaymentCalculator", () => {
    const code = read("src/app/financing/page.tsx");
    expect(code).toContain("vehiclePrice");
  });

  test("Financing page PaymentCalculator has a sensible default price (>= 10000)", () => {
    const code = read("src/app/financing/page.tsx");
    // Match vehiclePrice={NNNN} where NNNN >= 10000 (5 digits)
    const match = code.match(/vehiclePrice=\{(\d+)\}/);
    expect(match, "vehiclePrice prop not found in JSX").toBeTruthy();
    const price = parseInt(match![1], 10);
    expect(price).toBeGreaterThanOrEqual(10000);
  });
});
