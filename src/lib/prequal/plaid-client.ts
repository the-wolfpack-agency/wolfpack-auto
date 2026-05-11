/**
 * Plaid (income verification) abstraction.
 *
 * Honest about mocks vs. real APIs:
 *
 *   MockIncomeProvider   -- deterministic income data, CLEARLY LABELED.
 *                           Used for v0.1 of the flow + every unit test.
 *   PlaidIncomeProvider  -- stub. throws NotImplementedError. requires
 *                           PLAID_CLIENT_ID + PLAID_SECRET + Plaid's
 *                           Income product enabled on the account. The
 *                           Plaid dev tier is the most realistic path to
 *                           wiring this for real (free sandbox + dev tier
 *                           usable in QA + production behind paid usage).
 *
 * Selection is via `getIncomeProvider()`; in production this reads
 * `INCOME_VERIFICATION_PROVIDER`. When unset, falls back to mock (which
 * is the safe default -- never accidentally call a paid Plaid API on a
 * missing env var).
 */

import type {
  IncomeConfidence,
  IncomeResult,
  LinkSession,
} from "./types";

/* -------------------------------------------------------------------------- */
/* Errors                                                                     */
/* -------------------------------------------------------------------------- */

export class IncomeProviderNotConfiguredError extends Error {
  constructor(hint: string) {
    super(`[prequal/plaid-client] Plaid provider not implemented: ${hint}`);
    this.name = "IncomeProviderNotConfiguredError";
  }
}

/* -------------------------------------------------------------------------- */
/* Public abstraction                                                         */
/* -------------------------------------------------------------------------- */

export interface IncomeVerificationProvider {
  readonly providerName: string;
  isAvailable(): boolean;
  startLink(): Promise<LinkSession>;
  getIncome(token: string): Promise<IncomeResult>;
}

/* -------------------------------------------------------------------------- */
/* Self-reported income — used when the customer types their income manually  */
/* -------------------------------------------------------------------------- */

export interface SelfReportedIncomeInput {
  /** Customer-provided annual or monthly. We normalize to monthly cents. */
  amountCents: number;
  cadence: "monthly" | "annual";
}

/**
 * Normalize a customer-self-reported income to monthly cents. Pure function.
 * Confidence is always `self_reported` -- never lie to the lender engine
 * about whether income is verified.
 */
export function normalizeSelfReportedIncome(
  input: SelfReportedIncomeInput,
): IncomeResult {
  const monthly =
    input.cadence === "annual"
      ? Math.floor(input.amountCents / 12)
      : input.amountCents;
  return {
    incomeMonthlyCents: monthly,
    confidence: "self_reported",
    isMock: false,
  };
}

/* -------------------------------------------------------------------------- */
/* Mock provider — deterministic, clearly labeled                             */
/* -------------------------------------------------------------------------- */

export class MockIncomeProvider implements IncomeVerificationProvider {
  readonly providerName = "mock";

  isAvailable(): boolean {
    return true;
  }

  async startLink(): Promise<LinkSession> {
    return {
      linkToken: "mock-link-token-NOT-REAL",
      isMock: true,
      // Expire 30 minutes from now to match Plaid's real link-token TTL.
      expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    };
  }

  async getIncome(token: string): Promise<IncomeResult> {
    // Deterministic monthly income based on the token characters. Keeps
    // tests stable + lets demos show consistent numbers.
    let h = 0;
    for (let i = 0; i < token.length; i++) {
      h = (h * 31 + token.charCodeAt(i)) | 0;
    }
    const bucket = Math.abs(h) % 5;
    const monthlyCents = [350_000, 480_000, 620_000, 850_000, 1_200_000][
      bucket
    ] as number;

    return {
      incomeMonthlyCents: monthlyCents,
      confidence: "mock" as IncomeConfidence,
      itemId: `mock-item-${bucket}`,
      isMock: true,
    };
  }
}

/* -------------------------------------------------------------------------- */
/* Real Plaid stub — intentionally throws on call                             */
/* -------------------------------------------------------------------------- */

export class PlaidIncomeProvider implements IncomeVerificationProvider {
  readonly providerName = "plaid";

  isAvailable(): boolean {
    return false;
  }

  async startLink(): Promise<LinkSession> {
    // requires Plaid API key; not implemented.
    throw new IncomeProviderNotConfiguredError(
      "requires PLAID_CLIENT_ID + PLAID_SECRET + Income product enabled. Plaid has a dev tier so this is the most realistic path to wire later.",
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async getIncome(_token: string): Promise<IncomeResult> {
    // requires Plaid API key; not implemented.
    throw new IncomeProviderNotConfiguredError(
      "requires PLAID_CLIENT_ID + PLAID_SECRET + Income product enabled. See Plaid's /credit/payroll_income/get endpoint when wiring this for real.",
    );
  }
}

/* -------------------------------------------------------------------------- */
/* Provider selector                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Return the configured income provider. Safe default = MockProvider so
 * we NEVER accidentally hit Plaid on a missing env var.
 */
export function getIncomeProvider(): IncomeVerificationProvider {
  const which = (process.env.INCOME_VERIFICATION_PROVIDER ?? "mock").toLowerCase();
  switch (which) {
    case "plaid":
      return new PlaidIncomeProvider();
    case "mock":
      return new MockIncomeProvider();
    default:
      console.warn(
        `[prequal/plaid-client] Unknown INCOME_VERIFICATION_PROVIDER=${which}, falling back to mock`,
      );
      return new MockIncomeProvider();
  }
}
