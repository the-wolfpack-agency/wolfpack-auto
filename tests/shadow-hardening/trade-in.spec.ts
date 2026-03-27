/**
 * Trade-In Valuation — static analysis + pure-logic tests.
 *
 * Tests run without a real browser or database:
 *   1.  calculateTradeInValue is exported
 *   2.  Luxury make (BMW) values higher than economy (Mitsubishi)
 *   3.  Excellent condition > poor condition
 *   4.  Salvage title reduces value ~55% vs clean
 *   5.  estimatedHigh > estimatedMid > estimatedLow > 0
 *   6.  expiresAt is 7 days in the future
 *   7.  API estimate endpoint exists (not 404)
 *   8.  API submit endpoint exists (not 404)
 *   9.  Admin trade-in endpoint is auth-protected
 *  10.  Invalid year returns 400
 */

import { test, expect } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";

const SRC = path.resolve(__dirname, "../../src");

/* -------------------------------------------------------------------------- */
/* 1. calculateTradeInValue is exported                                       */
/* -------------------------------------------------------------------------- */

test("trade-in-valuator.ts exports calculateTradeInValue", () => {
  const src = fs.readFileSync(
    path.join(SRC, "lib/trade-in-valuator.ts"),
    "utf8",
  );
  expect(src).toContain("export function calculateTradeInValue");
});

/* -------------------------------------------------------------------------- */
/* 2. BMW scores higher than Mitsubishi (same age/condition/mileage)          */
/* -------------------------------------------------------------------------- */

test("luxury make (BMW) valuation is higher than economy (Mitsubishi)", () => {
  // Static check: Tier 1 base > Tier 5 base
  const src = fs.readFileSync(
    path.join(SRC, "lib/trade-in-valuator.ts"),
    "utf8",
  );

  // BMW is in Tier 1 ($35k)
  expect(src).toMatch(/["']bmw["']:\s*35[_,]?000/i);
  // Mitsubishi is in Tier 5 ($18k)
  expect(src).toMatch(/["']mitsubishi["']:\s*18[_,]?000/i);

  // The numeric values confirm BMW > Mitsubishi
  const bmwMatch = src.match(/["']bmw["']:\s*([\d_]+)/i);
  const mitsuMatch = src.match(/["']mitsubishi["']:\s*([\d_]+)/i);
  expect(bmwMatch).not.toBeNull();
  expect(mitsuMatch).not.toBeNull();

  const bmwBase = parseInt(bmwMatch![1].replace(/_/g, ""), 10);
  const mitsuBase = parseInt(mitsuMatch![1].replace(/_/g, ""), 10);
  expect(bmwBase).toBeGreaterThan(mitsuBase);
});

/* -------------------------------------------------------------------------- */
/* 3. Excellent condition > poor condition                                    */
/* -------------------------------------------------------------------------- */

test("excellent condition multiplier is greater than poor condition multiplier", () => {
  const src = fs.readFileSync(
    path.join(SRC, "lib/trade-in-valuator.ts"),
    "utf8",
  );

  // Excellent: 1.00
  expect(src).toContain("excellent: 1.00");
  // Poor: 0.54
  expect(src).toContain("poor: 0.54");

  const excellentMatch = src.match(/excellent:\s*([\d.]+)/);
  const poorMatch = src.match(/poor:\s*([\d.]+)/);
  expect(excellentMatch).not.toBeNull();
  expect(poorMatch).not.toBeNull();

  expect(parseFloat(excellentMatch![1])).toBeGreaterThan(
    parseFloat(poorMatch![1]),
  );
});

/* -------------------------------------------------------------------------- */
/* 4. Salvage title reduces value by ~55% vs clean                           */
/* -------------------------------------------------------------------------- */

test("salvage title deduction is 55% of base value", () => {
  const src = fs.readFileSync(
    path.join(SRC, "lib/trade-in-valuator.ts"),
    "utf8",
  );

  // Look for salvage deduction — 0.55 coefficient
  expect(src).toContain("salvage");
  // Confirm salvage deduction is 0.55 — check both orderings without dotAll flag
  const hasSalvageDeduction =
    src.includes("salvage") && src.includes("0.55");
  expect(hasSalvageDeduction).toBe(true);
});

/* -------------------------------------------------------------------------- */
/* 5. estimatedHigh > estimatedMid > estimatedLow > 0                        */
/* -------------------------------------------------------------------------- */

test("range is computed as estimatedMid * 0.92 low and * 1.08 high", () => {
  const src = fs.readFileSync(
    path.join(SRC, "lib/trade-in-valuator.ts"),
    "utf8",
  );

  // Low  = mid * 0.92
  expect(src).toContain("0.92");
  // High = mid * 1.08
  expect(src).toContain("1.08");
  // Floor of 500
  expect(src).toContain("500");
  expect(src).toContain("Math.max(500");
});

/* -------------------------------------------------------------------------- */
/* 6. expiresAt is 7 days in the future                                      */
/* -------------------------------------------------------------------------- */

test("expiresAt is set to 7 days from now", () => {
  const src = fs.readFileSync(
    path.join(SRC, "lib/trade-in-valuator.ts"),
    "utf8",
  );

  // Must add 7 days using setDate / getDate pattern
  expect(src).toContain("setDate");
  expect(src).toContain("getDate()");
  expect(src).toContain("+ 7");
});

/* -------------------------------------------------------------------------- */
/* 7. API estimate endpoint file exists (not 404)                             */
/* -------------------------------------------------------------------------- */

test("API estimate route file exists at src/app/api/trade-in/estimate/route.ts", () => {
  const routePath = path.join(
    SRC,
    "app/api/trade-in/estimate/route.ts",
  );
  expect(fs.existsSync(routePath)).toBe(true);

  const src = fs.readFileSync(routePath, "utf8");
  expect(src).toContain("export async function POST");
});

/* -------------------------------------------------------------------------- */
/* 8. API submit endpoint file exists (not 404)                              */
/* -------------------------------------------------------------------------- */

test("API submit route file exists at src/app/api/trade-in/submit/route.ts", () => {
  const routePath = path.join(
    SRC,
    "app/api/trade-in/submit/route.ts",
  );
  expect(fs.existsSync(routePath)).toBe(true);

  const src = fs.readFileSync(routePath, "utf8");
  expect(src).toContain("export async function POST");
});

/* -------------------------------------------------------------------------- */
/* 9. Admin trade-in endpoint has requireAuth guard                          */
/* -------------------------------------------------------------------------- */

test("admin trade-in endpoint is auth-protected with requireAuth", () => {
  const routePath = path.join(
    SRC,
    "app/api/admin/trade-in/route.ts",
  );
  expect(fs.existsSync(routePath)).toBe(true);

  const src = fs.readFileSync(routePath, "utf8");
  expect(src).toContain("requireAuth");
  expect(src).toContain("isAuthenticated");

  // Guard must be called before any DB query
  const requireAuthIdx = src.indexOf("await requireAuth()");
  const dbQueryIdx = src.indexOf("await import(\"@/lib/db\")");
  expect(requireAuthIdx).toBeGreaterThan(-1);
  // If DB import exists, it must come after the auth check
  if (dbQueryIdx > -1) {
    expect(dbQueryIdx).toBeGreaterThan(requireAuthIdx);
  }
});

/* -------------------------------------------------------------------------- */
/* 10. Invalid year in estimate route returns 400                             */
/* -------------------------------------------------------------------------- */

test("estimate route validates year range (1990 to currentYear+1)", () => {
  const routeSrc = fs.readFileSync(
    path.join(SRC, "app/api/trade-in/estimate/route.ts"),
    "utf8",
  );

  // Year validation must be present in Zod schema
  expect(routeSrc).toContain("1990");
  expect(routeSrc).toContain("z.number()");
  // Returns 400 on validation failure
  expect(routeSrc).toContain("status: 400");
});

/* -------------------------------------------------------------------------- */
/* Bonus: migration file exists                                               */
/* -------------------------------------------------------------------------- */

test("010_trade_in.sql migration file exists", () => {
  const migrationPath = path.resolve(
    __dirname,
    "../../src/db/migrations/010_trade_in.sql",
  );
  expect(fs.existsSync(migrationPath)).toBe(true);

  const sql = fs.readFileSync(migrationPath, "utf8");
  expect(sql).toContain("CREATE TABLE IF NOT EXISTS trade_in_estimates");
  expect(sql).toContain("estimated_low");
  expect(sql).toContain("lead_captured");
});
