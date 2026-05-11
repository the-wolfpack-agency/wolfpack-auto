/**
 * Lender quote engine -- pure function from (credit, income, vehicle)
 * to a list of pre-approval offers from configurable synthetic lenders.
 *
 * No I/O. Every test runs without a DB or network. Deterministic so the
 * UI / E2E tests can assert specific offer counts and APRs.
 *
 * 5 synthetic lenders with realistic rules:
 *
 *   prime-bank             super_prime + prime, low APR, max LTV 115%
 *   wolfpack-financial     prime + near_prime, mid APR, max LTV 120%
 *   second-chance-credit   near_prime + subprime, higher APR, LTV 110%
 *   buy-here-pay-here      subprime + deep_subprime, very high APR, LTV 100%
 *   captive-oem-finance    super_prime + prime only, ULTRA low APR, LTV 100%
 *
 * Realism: max-LTV gates affordability so a customer asking about a
 * $90k truck on $3k/mo income gets a smaller `max_amount_cents` than
 * the lender's advertised maximum. Term/APR/payment all interplay.
 */

import type {
  CreditResult,
  IncomeResult,
  LenderRule,
  PrequalOffer,
  VehicleInterest,
  CreditTier,
} from "./types";

/* -------------------------------------------------------------------------- */
/* Constants                                                                  */
/* -------------------------------------------------------------------------- */

/** Tiers ordered "best" -> "worst" for tier-comparison helpers. */
const TIER_ORDER: CreditTier[] = [
  "super_prime",
  "prime",
  "near_prime",
  "subprime",
  "deep_subprime",
];

/** Default offer expiry: 14 days. Real lenders run 15-30 day windows. */
const OFFER_TTL_MS = 14 * 24 * 60 * 60 * 1000;

/** Payment-to-income cap (DTI proxy). Lenders typically cap PTI ~20%. */
const DEFAULT_PTI_CAP = 0.2;

/* -------------------------------------------------------------------------- */
/* Default synthetic lender catalog                                           */
/* -------------------------------------------------------------------------- */

export const DEFAULT_LENDERS: LenderRule[] = [
  {
    lenderId: "captive-oem-finance",
    lenderName: "Captive OEM Finance",
    minTier: "prime",
    maxTermMonths: 72,
    maxLtvBps: 10_000, // 100%
    minMonthlyIncomeCents: 350_000,
    aprBpsByTier: {
      super_prime: 290,
      prime: 449,
    },
    defaultTermMonths: 60,
    maxLoanAmountCents: 10_000_000,
  },
  {
    lenderId: "prime-bank",
    lenderName: "Prime Bank Auto",
    minTier: "prime",
    maxTermMonths: 84,
    maxLtvBps: 11_500, // 115%
    minMonthlyIncomeCents: 300_000,
    aprBpsByTier: {
      super_prime: 549,
      prime: 699,
    },
    defaultTermMonths: 72,
    maxLoanAmountCents: 8_000_000,
  },
  {
    lenderId: "wolfpack-financial",
    lenderName: "Wolfpack Financial",
    minTier: "near_prime",
    maxTermMonths: 84,
    maxLtvBps: 12_000, // 120%
    minMonthlyIncomeCents: 250_000,
    aprBpsByTier: {
      super_prime: 599,
      prime: 749,
      near_prime: 1_099,
    },
    defaultTermMonths: 72,
    maxLoanAmountCents: 6_500_000,
  },
  {
    lenderId: "second-chance-credit",
    lenderName: "Second Chance Credit Union",
    minTier: "subprime",
    maxTermMonths: 72,
    maxLtvBps: 11_000, // 110%
    minMonthlyIncomeCents: 200_000,
    aprBpsByTier: {
      near_prime: 1_249,
      subprime: 1_799,
    },
    defaultTermMonths: 66,
    maxLoanAmountCents: 4_000_000,
  },
  {
    lenderId: "buy-here-pay-here",
    lenderName: "Local Buy-Here Pay-Here",
    minTier: "deep_subprime",
    maxTermMonths: 60,
    maxLtvBps: 10_000, // 100%
    minMonthlyIncomeCents: 150_000,
    aprBpsByTier: {
      subprime: 2_199,
      deep_subprime: 2_499,
    },
    defaultTermMonths: 48,
    maxLoanAmountCents: 2_500_000,
  },
];

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function tierIndex(tier: CreditTier): number {
  return TIER_ORDER.indexOf(tier);
}

/** A customer at `applicantTier` qualifies for a lender minimum of `minTier`. */
function tierMeetsMinimum(
  applicantTier: CreditTier,
  minTier: CreditTier,
): boolean {
  return tierIndex(applicantTier) <= tierIndex(minTier);
}

/**
 * Standard monthly payment for an amortizing loan.
 * P * r / (1 - (1 + r)^-n) where r = monthly rate, n = term.
 */
function monthlyPaymentCents(
  principalCents: number,
  aprBps: number,
  termMonths: number,
): number {
  const monthlyRate = aprBps / 10_000 / 12;
  if (monthlyRate === 0) return Math.ceil(principalCents / termMonths);
  const factor = Math.pow(1 + monthlyRate, -termMonths);
  return Math.ceil((principalCents * monthlyRate) / (1 - factor));
}

/**
 * Compute the maximum principal a lender can offer this applicant given
 * - PTI cap (monthly payment must be <= 20% of monthly income)
 * - LTV cap (principal must be <= vehicle price * LTV)
 * - Lender's hard ceiling.
 *
 * Returns 0 when the applicant fails any gate.
 */
function maxPrincipalCents(
  rule: LenderRule,
  aprBps: number,
  income: IncomeResult,
  vehicle: VehicleInterest,
): number {
  const ltvCeiling = Math.floor(
    (vehicle.estimatedPriceCents * rule.maxLtvBps) / 10_000,
  );
  const lenderCeiling = rule.maxLoanAmountCents;

  // PTI ceiling: solve principal so monthlyPayment(P, apr, term) <= 0.2 * income
  const maxMonthlyPayment = Math.floor(income.incomeMonthlyCents * DEFAULT_PTI_CAP);
  const monthlyRate = aprBps / 10_000 / 12;
  const term = rule.defaultTermMonths;
  let ptiCeiling: number;
  if (monthlyRate === 0) {
    ptiCeiling = maxMonthlyPayment * term;
  } else {
    const factor = Math.pow(1 + monthlyRate, -term);
    ptiCeiling = Math.floor(
      (maxMonthlyPayment * (1 - factor)) / monthlyRate,
    );
  }

  return Math.max(0, Math.min(ltvCeiling, lenderCeiling, ptiCeiling));
}

/* -------------------------------------------------------------------------- */
/* Engine                                                                     */
/* -------------------------------------------------------------------------- */

export interface QuoteEngineInput {
  credit: CreditResult;
  income: IncomeResult;
  vehicle: VehicleInterest;
  /** Optional override -- defaults to DEFAULT_LENDERS. */
  lenders?: LenderRule[];
  /** Optional "now" for deterministic tests. */
  now?: Date;
}

/**
 * Pure -- given credit + income + vehicle interest, return all qualifying
 * lender offers. Returns an empty array if no lender qualifies.
 */
export function generateQuotes(input: QuoteEngineInput): PrequalOffer[] {
  const lenders = input.lenders ?? DEFAULT_LENDERS;
  const now = input.now ?? new Date();
  const expiresAt = new Date(now.getTime() + OFFER_TTL_MS).toISOString();

  const offers: PrequalOffer[] = [];

  for (const rule of lenders) {
    // Gate 1: tier
    if (!tierMeetsMinimum(input.credit.tier, rule.minTier)) continue;

    // Gate 2: lender actually has an APR for this tier
    const aprBps = rule.aprBpsByTier[input.credit.tier];
    if (typeof aprBps !== "number") continue;

    // Gate 3: minimum income
    if (input.income.incomeMonthlyCents < rule.minMonthlyIncomeCents) continue;

    // Gate 4: principal must be > 0 after PTI + LTV + lender ceiling
    const maxPrincipal = maxPrincipalCents(rule, aprBps, input.income, input.vehicle);
    if (maxPrincipal <= 0) continue;

    const term = rule.defaultTermMonths;
    const payment = monthlyPaymentCents(maxPrincipal, aprBps, term);

    offers.push({
      lenderId: rule.lenderId,
      lenderName: rule.lenderName,
      maxAmountCents: maxPrincipal,
      aprBps,
      termMonths: term,
      conditions: {
        min_credit_tier: rule.minTier,
        max_ltv_bps: rule.maxLtvBps,
        pti_cap_bps: Math.floor(DEFAULT_PTI_CAP * 10_000),
        bureau_used: input.credit.bureauUsed,
        income_confidence: input.income.confidence,
        income_is_mock: input.income.isMock,
        credit_is_mock: input.credit.isMock,
      },
      expiresAt,
      estimatedMonthlyPaymentCents: payment,
    });
  }

  // Sort: lowest APR first -- it's the customer-facing ordering.
  offers.sort((a, b) => a.aprBps - b.aprBps);
  return offers;
}

/* -------------------------------------------------------------------------- */
/* Exported helpers for callers + tests                                       */
/* -------------------------------------------------------------------------- */

export { monthlyPaymentCents, tierMeetsMinimum };
