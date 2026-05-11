/**
 * Valuation Providers — abstraction over book-value sources.
 *
 * Default implementation: MockValuationProvider. It is DETERMINISTIC and
 * REALISTIC (a transparent age + miles + condition depreciation model), but
 * is NOT live-market data. Every value carries `isMock: true` and a clearly
 * labeled provider name so the UI can surface "estimate" to the user and so
 * future developers know not to mistake the demo data for real KBB / Black
 * Book / J.D. Power partnerships.
 *
 * To activate a real partnership:
 *   1. Implement `getMarketValue` on KbbValuationProvider below using the
 *      partner API.
 *   2. Set process.env.KBB_API_KEY in Vercel.
 *   3. `chooseValuationProvider()` will route automatically.
 *
 * Note: there is a SEPARATE `src/lib/market-pricing.ts` that does pure
 * depreciation-curve estimation for used-vehicle MSRP lookups. This module
 * is the *external valuation provider* layer above that — call sites that
 * want a snapshot consume THIS file; call sites that want a fast in-process
 * lookup use market-pricing.ts. The two intentionally do not overlap.
 */

import { cacheGet, cacheSet } from "@/lib/cache";
import type { ConditionGrade, MarketValue } from "@/lib/market-intel/types";

const CACHE_TTL_SECONDS = 60 * 60 * 24; // 24h per .ai/conventions.md

export interface ValuationRequest {
  vin: string;
  year: number;
  make: string;
  model: string;
  miles?: number;
  zipCode?: string;
  conditionGrade?: ConditionGrade;
}

export interface ValuationProvider {
  readonly name: string;
  readonly isMock: boolean;
  getMarketValue(req: ValuationRequest): Promise<MarketValue>;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/**
 * Deterministic-but-realistic mock baseline.
 *
 * Returns a stable number per (vin, year, make, model, miles, condition) so
 * tests + the UI never see jitter run-to-run. The arithmetic mirrors a real
 * used-vehicle depreciation curve (20% year-1, 10%/yr thereafter, +/-15% for
 * condition, $0.10/mile penalty over 12k/yr).
 */
function deterministicBaselineCents(req: ValuationRequest): number {
  const currentYear = new Date().getUTCFullYear();
  const age = Math.max(0, currentYear - (req.year || currentYear));

  // Segment-based base MSRP guesses (cents). Match what a typical 2024 new
  // car of that broad class would have stickered at. Never claims to be a
  // real MSRP lookup — that's what market-pricing.ts's table is for.
  const make = (req.make || "").toLowerCase();
  let baseMsrpCents = 3_500_000; // $35,000
  if (/(porsche|tesla|audi|bmw|mercedes|lexus|cadillac)/.test(make)) {
    baseMsrpCents = 6_000_000; // $60,000
  } else if (/(toyota|honda|mazda|subaru|hyundai|kia|volkswagen|nissan)/.test(make)) {
    baseMsrpCents = 3_000_000; // $30,000
  } else if (/(ford|chevrolet|gmc|ram|jeep|dodge|chrysler)/.test(make)) {
    baseMsrpCents = 3_800_000; // $38,000
  }

  // Year-one drop, then linear -10%/yr down to floor.
  let value = baseMsrpCents;
  if (age >= 1) value *= 0.8;
  for (let i = 2; i <= age; i++) value *= 0.9;
  value = Math.max(value, 200_000); // $2,000 floor

  // Miles penalty over 12k/yr expected.
  const expected = age * 12_000;
  const miles = req.miles ?? expected;
  const overMiles = Math.max(0, miles - expected);
  value -= overMiles * 10; // $0.10/mile in cents

  // Condition.
  const cond = req.conditionGrade ?? "good";
  const condMult: Record<ConditionGrade, number> = {
    excellent: 1.08,
    good: 1.0,
    fair: 0.9,
    rough: 0.78,
  };
  value *= condMult[cond];

  return Math.max(50_000, Math.round(value));
}

function cacheKey(label: string, req: ValuationRequest): string {
  return `market-intel:val:${label}:${req.vin}:${req.miles ?? "x"}:${req.zipCode ?? "x"}:${req.conditionGrade ?? "good"}`;
}

/* ------------------------------------------------------------------ */
/*  MockValuationProvider — default, deterministic                     */
/* ------------------------------------------------------------------ */

/**
 * IMPORTANT: this is a MOCK provider. Every `MarketValue` returned has
 * `isMock: true` and `providerLabel` starts with "Mock". UI surfaces use
 * those flags to render an "estimate" badge so dealers + future devs never
 * confuse this with real KBB / Black Book / J.D. Power output.
 */
export class MockValuationProvider implements ValuationProvider {
  readonly name = "mock";
  readonly isMock = true;

  async getMarketValue(req: ValuationRequest): Promise<MarketValue> {
    const cached = await cacheGet<MarketValue>(cacheKey("mock", req));
    if (cached) return cached;

    const cents = deterministicBaselineCents(req);
    const value: MarketValue = {
      source: "mock",
      marketValueCents: cents,
      conditionGrade: req.conditionGrade ?? "good",
      miles: req.miles,
      zipCode: req.zipCode,
      isMock: true,
      providerLabel: "Mock estimate (no partnership)",
      capturedAt: new Date().toISOString(),
      rawPayload: {
        note: "Deterministic depreciation model. Swap with a paid valuation provider for production.",
      },
    };

    await cacheSet(cacheKey("mock", req), value, CACHE_TTL_SECONDS);
    return value;
  }
}

/* ------------------------------------------------------------------ */
/*  KbbValuationProvider — stub (paid partnership required)            */
/* ------------------------------------------------------------------ */

/**
 * Stub for Kelley Blue Book.
 *
 * Status: NOT IMPLEMENTED. Requires a paid KBB / Cox Automotive
 * partnership + API credentials. Until that lands, instantiating this
 * provider with `getMarketValue` throws a clear "not implemented" error.
 *
 * When implementing:
 *   - Wrap the KBB API in a fetch with AbortSignal.timeout(8000).
 *   - Map their fair/good/very_good grades onto our ConditionGrade.
 *   - Return `source: "kbb"`, `isMock: false`, `providerLabel: "KBB"`.
 */
export class KbbValuationProvider implements ValuationProvider {
  readonly name = "kbb";
  readonly isMock = false;

  async getMarketValue(_req: ValuationRequest): Promise<MarketValue> {
    throw new Error(
      "KbbValuationProvider is a stub. Requires paid KBB partnership; not implemented.",
    );
  }
}

/* ------------------------------------------------------------------ */
/*  Provider factory                                                    */
/* ------------------------------------------------------------------ */

/**
 * Pick the right provider for the current environment.
 *
 * Order of preference:
 *   1. KBB if `process.env.KBB_API_KEY` is set (real partnership active).
 *   2. Mock otherwise.
 *
 * Tests can inject their own provider via `setValuationProviderForTest()`.
 */
let overrideProvider: ValuationProvider | null = null;

export function setValuationProviderForTest(
  p: ValuationProvider | null,
): void {
  overrideProvider = p;
}

export function chooseValuationProvider(): ValuationProvider {
  if (overrideProvider) return overrideProvider;
  if (process.env.KBB_API_KEY) return new KbbValuationProvider();
  return new MockValuationProvider();
}
