/**
 * Shared types for the pre-qualification flow.
 *
 * Kept in a single types file so credit-bureau.ts / plaid-client.ts /
 * lender-quote-engine.ts can import without circular references.
 */

export type CreditTier =
  | "super_prime" // 781-850
  | "prime"        // 661-780
  | "near_prime"   // 601-660
  | "subprime"     // 501-600
  | "deep_subprime"; // 300-500

export type CreditBureau = "mock" | "experian" | "equifax" | "transunion";

export interface CreditApplicant {
  /** Full legal name. */
  name: string;
  /** Email already-normalized to lowercase + trimmed. */
  email: string;
  /** Optional phone (E.164 preferred). */
  phone?: string;
  /** Optional last four of SSN — required for any real bureau pull. */
  ssnLastFour?: string;
  /** Optional date of birth in YYYY-MM-DD — required for any real bureau pull. */
  dateOfBirth?: string;
}

export interface CreditResult {
  bureauUsed: CreditBureau;
  /** Range, not point estimate — soft pulls return ranges to clients. */
  scoreRangeMin: number;
  scoreRangeMax: number;
  tier: CreditTier;
  /**
   * Opaque payload from the bureau. Encrypted before persistence via
   * src/lib/crypto.ts. Stored only so we can audit a dispute later.
   */
  rawResponse: string;
  /**
   * `true` when the data came from a mock provider. Front-end MUST surface
   * this so a customer never sees a fake number presented as a real bureau.
   */
  isMock: boolean;
}

export type IncomeConfidence =
  | "self_reported"
  | "mock"
  | "plaid_low"
  | "plaid_medium"
  | "plaid_high";

export interface LinkSession {
  /** Short-lived link token the front-end exchanges with Plaid Link. */
  linkToken: string;
  /** Whether the session is mock or real. */
  isMock: boolean;
  expiresAt: string;
}

export interface IncomeResult {
  /** Monthly gross income in cents. */
  incomeMonthlyCents: number;
  confidence: IncomeConfidence;
  /** Plaid item id (when real Plaid). */
  itemId?: string;
  /** Plaid access token, plaintext. NEVER persist plaintext — encrypt first. */
  accessToken?: string;
  isMock: boolean;
}

export interface VehicleInterest {
  /** Free-form text from the customer ("2022 Tacoma" or "midsize SUV"). */
  text: string;
  /**
   * Estimated price the engine should use to compute affordability.
   * Defaults to a midpoint when the customer didn't pick a specific vehicle.
   */
  estimatedPriceCents: number;
}

export interface LenderRule {
  lenderId: string;
  lenderName: string;
  /** Lowest tier this lender will fund. Tiers below this get rejected. */
  minTier: CreditTier;
  /** Highest term this lender supports. */
  maxTermMonths: number;
  /** Loan-to-value ceiling, in basis points (e.g., 12500 = 125%). */
  maxLtvBps: number;
  /** Minimum monthly income, in cents. */
  minMonthlyIncomeCents: number;
  /**
   * APR offered by tier (basis points). Missing tier == lender will not lend
   * to that tier even if minTier is technically satisfied. Used to model
   * lender appetite for the cheapest paper.
   */
  aprBpsByTier: Partial<Record<CreditTier, number>>;
  /** Default term in months when the engine has no signal otherwise. */
  defaultTermMonths: number;
  /** Maximum loan amount the lender will write, in cents. */
  maxLoanAmountCents: number;
}

export interface PrequalOffer {
  lenderId: string;
  lenderName: string;
  maxAmountCents: number;
  aprBps: number;
  termMonths: number;
  conditions: Record<string, string | number | boolean>;
  /** ISO-8601 string. */
  expiresAt: string;
  /** Estimated monthly payment in cents (display helper). */
  estimatedMonthlyPaymentCents: number;
}
