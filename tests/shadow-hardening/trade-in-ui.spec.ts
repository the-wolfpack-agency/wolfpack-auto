/**
 * trade-in-ui.spec.ts
 *
 * Shadow-hardening static analysis for the trade-in wizard UI and admin
 * dashboard. Zero browser / zero network — all assertions read source files
 * on disk via fs.readFileSync.
 *
 * Runs in < 1 s and is safe in CI with no DB or server.
 */

import { test, expect } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

const ROOT = path.resolve(__dirname, "../..");

function src(...parts: string[]): string {
  return path.join(ROOT, ...parts);
}

function read(...parts: string[]): string {
  const p = src(...parts);
  expect(fs.existsSync(p), `File must exist: ${p}`).toBe(true);
  return fs.readFileSync(p, "utf8");
}

function exists(...parts: string[]): boolean {
  return fs.existsSync(src(...parts));
}

/* -------------------------------------------------------------------------- */
/* 1. TradeInWizard.tsx — client component existence + "use client"           */
/* -------------------------------------------------------------------------- */

test.describe("TradeInWizard client component", () => {
  test("TradeInWizard.tsx exists and declares use client", () => {
    const code = read("src/app/trade-in/TradeInWizard.tsx");
    expect(code).toContain('"use client"');
  });

  test("TradeInWizard.tsx has all 4 wizard steps (Step 1/4 through Step 4/4)", () => {
    const code = read("src/app/trade-in/TradeInWizard.tsx");
    // Checks the ProgressBar renders "Step X of 4" for steps 1-4
    expect(code).toContain("Step {step} of {total}");
    // Also check that 4 is the total hard-coded
    expect(code).toContain("<ProgressBar step={step} total={4}");
    // Verify all 4 step blocks exist
    expect(code).toContain("step === 1");
    expect(code).toContain("step === 2");
    expect(code).toContain("step === 3");
    expect(code).toContain("step === 4");
  });

  test("TradeInWizard.tsx calls POST /api/trade-in/estimate", () => {
    const code = read("src/app/trade-in/TradeInWizard.tsx");
    expect(code).toContain("/api/trade-in/estimate");
    expect(code).toContain('method: "POST"');
  });

  test("TradeInWizard.tsx calls POST /api/trade-in/submit", () => {
    const code = read("src/app/trade-in/TradeInWizard.tsx");
    expect(code).toContain("/api/trade-in/submit");
  });

  test("TradeInWizard.tsx has all four condition cards (excellent, good, fair, poor)", () => {
    const code = read("src/app/trade-in/TradeInWizard.tsx");
    expect(code.toLowerCase()).toContain("excellent");
    expect(code.toLowerCase()).toContain("good");
    expect(code.toLowerCase()).toContain("fair");
    expect(code.toLowerCase()).toContain("poor");
  });

  test("TradeInWizard.tsx has accident history options (none/minor/major)", () => {
    const code = read("src/app/trade-in/TradeInWizard.tsx");
    expect(code.toLowerCase()).toContain("no accidents");
    expect(code.toLowerCase()).toContain("minor accident");
    expect(code.toLowerCase()).toContain("major accident");
  });

  test("TradeInWizard.tsx has title status options (clean/rebuilt/salvage)", () => {
    const code = read("src/app/trade-in/TradeInWizard.tsx");
    expect(code.toLowerCase()).toContain("clean title");
    expect(code.toLowerCase()).toContain("rebuilt title");
    expect(code.toLowerCase()).toContain("salvage title");
  });
});

/* -------------------------------------------------------------------------- */
/* 2. Trade-in page server wrapper                                             */
/* -------------------------------------------------------------------------- */

test.describe("Trade-in page server wrapper", () => {
  test("src/app/trade-in/page.tsx exists", () => {
    expect(exists("src/app/trade-in/page.tsx")).toBe(true);
  });

  test("Trade-in page has metadata with Trade-In in the title", () => {
    const code = read("src/app/trade-in/page.tsx");
    expect(code).toContain("Trade-In");
    expect(code).toContain("metadata");
  });

  test("Trade-in page renders TradeInWizard", () => {
    const code = read("src/app/trade-in/page.tsx");
    expect(code).toContain("TradeInWizard");
  });
});

/* -------------------------------------------------------------------------- */
/* 3. Admin trade-in dashboard                                                 */
/* -------------------------------------------------------------------------- */

test.describe("Admin trade-in dashboard", () => {
  test("src/app/admin/trade-in/page.tsx exists", () => {
    expect(exists("src/app/admin/trade-in/page.tsx")).toBe(true);
  });

  test("Admin trade-in page fetches from /api/admin/trade-in", () => {
    const code = read("src/app/admin/trade-in/page.tsx");
    expect(code).toContain("/api/admin/trade-in");
  });

  test("Admin trade-in page has summary stat cards", () => {
    const code = read("src/app/admin/trade-in/page.tsx");
    expect(code).toContain("Total Estimates");
    expect(code).toContain("Leads Captured");
    expect(code).toContain("Conversion Rate");
    expect(code).toContain("Avg Estimated Value");
  });

  test("Admin trade-in page has table headers (Date, Vehicle, Estimated Value, Lead Captured)", () => {
    const code = read("src/app/admin/trade-in/page.tsx");
    expect(code).toContain("Date");
    expect(code).toContain("Vehicle");
    expect(code).toContain("Estimated Value");
    expect(code).toContain("Lead Captured");
  });

  test("Admin trade-in page hides Mileage and Condition on mobile with sm:table-cell", () => {
    const code = read("src/app/admin/trade-in/page.tsx");
    // Both columns should use hidden + sm:table-cell
    const matches = (code.match(/sm:table-cell/g) ?? []).length;
    expect(matches).toBeGreaterThanOrEqual(2);
  });

  test("Admin trade-in page has empty state message", () => {
    const code = read("src/app/admin/trade-in/page.tsx");
    expect(code).toContain("No trade-in submissions yet");
  });
});

/* -------------------------------------------------------------------------- */
/* 4. Navigation — public nav + admin sidebar                                  */
/* -------------------------------------------------------------------------- */

test.describe("Navigation integration", () => {
  test("AdminSidebar contains Trade-Ins nav item linking to /admin/trade-in", () => {
    const code = read("src/components/AdminSidebar.tsx");
    expect(code).toContain("/admin/trade-in");
    expect(code).toContain("Trade-Ins");
  });

  test("AdminSidebar has TradeInIcon function defined", () => {
    const code = read("src/components/AdminSidebar.tsx");
    expect(code).toContain("TradeInIcon");
  });

  test("Public layout nav includes Trade-In link", () => {
    const code = read("src/app/layout.tsx");
    expect(code).toContain("/trade-in");
    expect(code).toContain("Trade-In");
  });

  test("MobileMenu includes Trade-In link", () => {
    const code = read("src/components/MobileMenu.tsx");
    expect(code).toContain("/trade-in");
    expect(code).toContain("Trade-In");
  });
});
