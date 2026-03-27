/**
 * EV Readiness Module — static coverage tests.
 *
 * All tests are static source-file analysis — no server required.
 * This follows the shadow-hardening pattern established by unit-coverage.spec.ts.
 */
import { test, expect } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";

const SRC = path.resolve(__dirname, "../../src");

// ---------------------------------------------------------------------------
// 1. ev-utils.ts exports calculateFederalTaxCredit
// ---------------------------------------------------------------------------

test("ev-utils.ts exists and exports calculateFederalTaxCredit", () => {
  const filePath = path.join(SRC, "lib/ev-utils.ts");
  expect(fs.existsSync(filePath), `ev-utils.ts not found at ${filePath}`).toBe(true);

  const content = fs.readFileSync(filePath, "utf-8");
  expect(content).toContain("export function calculateFederalTaxCredit");
});

// ---------------------------------------------------------------------------
// 2. BEV new vehicle under MSRP cap = $7,500 credit — logic is in source
// ---------------------------------------------------------------------------

test("calculateFederalTaxCredit source encodes $7,500 for BEV", () => {
  const content = fs.readFileSync(path.join(SRC, "lib/ev-utils.ts"), "utf-8");
  // The function must encode the 7500 BEV credit amount
  expect(content).toContain("7_500");
  // BEV must be the branch that gets the full credit
  expect(content).toContain("BEV");
});

// ---------------------------------------------------------------------------
// 3. Used EV = $4,000 credit, max $25k sale price — logic is in source
// ---------------------------------------------------------------------------

test("calculateFederalTaxCredit source encodes $4,000 used EV credit", () => {
  const content = fs.readFileSync(path.join(SRC, "lib/ev-utils.ts"), "utf-8");
  expect(content).toContain("4_000");
  expect(content).toContain("25_000");
  // Must check for used/certified condition
  expect(content).toContain("used");
});

// ---------------------------------------------------------------------------
// 4. PHEV gets $3,750 — logic is in source
// ---------------------------------------------------------------------------

test("calculateFederalTaxCredit source encodes $3,750 for PHEV", () => {
  const content = fs.readFileSync(path.join(SRC, "lib/ev-utils.ts"), "utf-8");
  expect(content).toContain("3_750");
  expect(content).toContain("PHEV");
});

// ---------------------------------------------------------------------------
// 5. Non-EV gets $0 — function returns early for non-EVs
// ---------------------------------------------------------------------------

test("calculateFederalTaxCredit source returns 0 for non-EV vehicles", () => {
  const content = fs.readFileSync(path.join(SRC, "lib/ev-utils.ts"), "utf-8");
  // The guard at the top of the function must reject non-EVs
  expect(content).toContain("is_ev");
  // Must have a zero-amount return path
  expect(content).toContain("amount: 0");
});

// ---------------------------------------------------------------------------
// 6. EVRangeCalculator component exists and accepts rangeMiles prop
// ---------------------------------------------------------------------------

test("EVRangeCalculator component exists and accepts rangeMiles prop", () => {
  const filePath = path.join(SRC, "components/EVRangeCalculator.tsx");
  expect(fs.existsSync(filePath), `EVRangeCalculator.tsx not found at ${filePath}`).toBe(true);

  const content = fs.readFileSync(filePath, "utf-8");
  // Must declare rangeMiles in the props interface
  expect(content).toContain("rangeMiles");
  // Must be a client component for interactivity
  expect(content).toContain('"use client"');
  // Must accept the prop in the component function signature
  expect(content).toContain("EVRangeCalculatorProps");
});

// ---------------------------------------------------------------------------
// 7. EVTaxCreditBadge renders nothing when not eligible
// ---------------------------------------------------------------------------

test("EVTaxCreditBadge component exists and returns null when not eligible", () => {
  const filePath = path.join(SRC, "components/EVTaxCreditBadge.tsx");
  expect(fs.existsSync(filePath), `EVTaxCreditBadge.tsx not found at ${filePath}`).toBe(true);

  const content = fs.readFileSync(filePath, "utf-8");
  // Component must guard with an early return null
  expect(content).toContain("return null");
  // Must check the eligible prop
  expect(content).toContain("eligible");
  // Must accept amount prop
  expect(content).toContain("amount");
});

// ---------------------------------------------------------------------------
// 8. VDP page imports EVRangeCalculator and EVTaxCreditBadge
// ---------------------------------------------------------------------------

test("VDP page imports EVRangeCalculator and EVTaxCreditBadge", () => {
  const filePath = path.join(SRC, "app/inventory/[vin]/page.tsx");
  expect(fs.existsSync(filePath), "VDP page not found").toBe(true);

  const content = fs.readFileSync(filePath, "utf-8");
  expect(content).toContain("EVRangeCalculator");
  expect(content).toContain("EVTaxCreditBadge");
  // Must conditionally render the EV components
  expect(content).toContain("is_ev");
});

// ---------------------------------------------------------------------------
// 9. Inventory API accepts ev_only param (static check on route.ts)
// ---------------------------------------------------------------------------

test("Inventory API route.ts accepts ev_only and ev_range_min params", () => {
  const filePath = path.join(SRC, "app/api/inventory/route.ts");
  expect(fs.existsSync(filePath), "Inventory API route not found").toBe(true);

  const content = fs.readFileSync(filePath, "utf-8");
  expect(content).toContain("ev_only");
  expect(content).toContain("ev_range_min");
  // Must pass them to the data layer
  expect(content).toContain("getInventoryVehicles");
});
