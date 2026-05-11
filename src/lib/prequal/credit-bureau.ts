/**
 * Credit bureau abstraction.
 *
 * Honest about mocks vs. real APIs:
 *
 *   MockCreditBureauProvider  -- deterministic, range-realistic, CLEARLY
 *                                LABELED. `isMock: true` is set on every
 *                                response so the UI can show a banner.
 *   ExperianSoftPullProvider  -- stub. throws NotImplementedError. requires
 *                                paid bureau onboarding (Experian Connect /
 *                                Precise ID API). not implemented.
 *   EquifaxSoftPullProvider   -- stub. throws NotImplementedError. requires
 *                                paid bureau onboarding. not implemented.
 *   TransUnionSoftPullProvider-- stub. throws NotImplementedError. requires
 *                                paid bureau onboarding. not implemented.
 *
 * Selection is via `getCreditBureauProvider()`; in production this reads
 * `CREDIT_BUREAU_PROVIDER`. When unset, falls back to mock (which is the
 * safe default -- never accidentally pull real credit on a missing env var).
 */

import type {
  CreditApplicant,
  CreditBureau,
  CreditResult,
  CreditTier,
} from "./types";

/* -------------------------------------------------------------------------- */
/* Errors                                                                     */
/* -------------------------------------------------------------------------- */

export class CreditBureauNotConfiguredError extends Error {
  constructor(provider: CreditBureau, hint: string) {
    super(
      `[prequal/credit-bureau] Provider '${provider}' is not implemented: ${hint}`,
    );
    this.name = "CreditBureauNotConfiguredError";
  }
}

/* -------------------------------------------------------------------------- */
/* Public abstraction                                                         */
/* -------------------------------------------------------------------------- */

export interface CreditBureauProvider {
  readonly bureau: CreditBureau;
  /** Returns `true` when this provider is safe to call (not a stub). */
  isAvailable(): boolean;
  softPull(applicant: CreditApplicant): Promise<CreditResult>;
}

/* -------------------------------------------------------------------------- */
/* Mock provider — deterministic, range-realistic, clearly labeled            */
/* -------------------------------------------------------------------------- */

/**
 * Hash an applicant's email + name into a deterministic 0..999 score nudge.
 * Used so the same applicant lands in the same tier on every call (useful
 * for testing + demos), without leaking the *real* hash anywhere.
 */
function deterministicNudge(applicant: CreditApplicant): number {
  const basis = `${applicant.email.toLowerCase()}|${applicant.name.toLowerCase()}`;
  let h = 0;
  for (let i = 0; i < basis.length; i++) {
    h = (h * 31 + basis.charCodeAt(i)) | 0;
  }
  return Math.abs(h) % 1000;
}

function tierFromScore(score: number): CreditTier {
  if (score >= 781) return "super_prime";
  if (score >= 661) return "prime";
  if (score >= 601) return "near_prime";
  if (score >= 501) return "subprime";
  return "deep_subprime";
}

function rangeFromTier(tier: CreditTier): {
  scoreRangeMin: number;
  scoreRangeMax: number;
} {
  switch (tier) {
    case "super_prime":
      return { scoreRangeMin: 781, scoreRangeMax: 850 };
    case "prime":
      return { scoreRangeMin: 661, scoreRangeMax: 780 };
    case "near_prime":
      return { scoreRangeMin: 601, scoreRangeMax: 660 };
    case "subprime":
      return { scoreRangeMin: 501, scoreRangeMax: 600 };
    case "deep_subprime":
      return { scoreRangeMin: 300, scoreRangeMax: 500 };
  }
}

export class MockCreditBureauProvider implements CreditBureauProvider {
  readonly bureau: CreditBureau = "mock";

  isAvailable(): boolean {
    return true;
  }

  async softPull(applicant: CreditApplicant): Promise<CreditResult> {
    // Spread the applicant population realistically: tilted toward prime,
    // with a long tail into subprime. Anchor: 700 + deterministic nudge in
    // the +/- 90 band so the same applicant always lands in the same tier.
    const nudge = deterministicNudge(applicant);
    const anchored = 620 + (nudge % 200); // 620..819
    const tier = tierFromScore(anchored);
    const range = rangeFromTier(tier);

    return {
      bureauUsed: "mock",
      scoreRangeMin: range.scoreRangeMin,
      scoreRangeMax: range.scoreRangeMax,
      tier,
      rawResponse: JSON.stringify({
        provider: "mock",
        anchor: anchored,
        labeled: "MOCK_BUREAU_RESPONSE_NOT_FROM_REAL_SOURCE",
        applicant_hash: nudge,
      }),
      isMock: true,
    };
  }
}

/* -------------------------------------------------------------------------- */
/* Real bureau stubs — intentionally throw on call                            */
/* -------------------------------------------------------------------------- */

export class ExperianSoftPullProvider implements CreditBureauProvider {
  readonly bureau: CreditBureau = "experian";
  isAvailable(): boolean {
    return false;
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async softPull(_applicant: CreditApplicant): Promise<CreditResult> {
    // requires paid bureau onboarding; not implemented.
    throw new CreditBureauNotConfiguredError(
      "experian",
      "requires Experian Precise ID / Connect API contract + EXPERIAN_CLIENT_ID + EXPERIAN_CLIENT_SECRET + signed end-user agreement",
    );
  }
}

export class EquifaxSoftPullProvider implements CreditBureauProvider {
  readonly bureau: CreditBureau = "equifax";
  isAvailable(): boolean {
    return false;
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async softPull(_applicant: CreditApplicant): Promise<CreditResult> {
    // requires paid bureau onboarding; not implemented.
    throw new CreditBureauNotConfiguredError(
      "equifax",
      "requires Equifax Ignite / OneScore API contract + EQUIFAX_API_KEY + signed permissible-purpose agreement",
    );
  }
}

export class TransUnionSoftPullProvider implements CreditBureauProvider {
  readonly bureau: CreditBureau = "transunion";
  isAvailable(): boolean {
    return false;
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async softPull(_applicant: CreditApplicant): Promise<CreditResult> {
    // requires paid bureau onboarding; not implemented.
    throw new CreditBureauNotConfiguredError(
      "transunion",
      "requires TransUnion TruVision / DriverRisk API contract + TRANSUNION_API_KEY + signed FCRA agreement",
    );
  }
}

/* -------------------------------------------------------------------------- */
/* Provider selector                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Return the configured credit-bureau provider. Safe default = MockProvider
 * so we NEVER accidentally pull real credit on a missing env var.
 *
 * Override via CREDIT_BUREAU_PROVIDER env var. Unknown values fall back to
 * mock (with a console.warn). Real providers throw on call until wired up.
 */
export function getCreditBureauProvider(): CreditBureauProvider {
  const which = (process.env.CREDIT_BUREAU_PROVIDER ?? "mock").toLowerCase();
  switch (which) {
    case "experian":
      return new ExperianSoftPullProvider();
    case "equifax":
      return new EquifaxSoftPullProvider();
    case "transunion":
      return new TransUnionSoftPullProvider();
    case "mock":
      return new MockCreditBureauProvider();
    default:
      console.warn(
        `[prequal/credit-bureau] Unknown CREDIT_BUREAU_PROVIDER=${which}, falling back to mock`,
      );
      return new MockCreditBureauProvider();
  }
}
