/**
 * Stripe Connect Payment Integration
 *
 * Handles payment processing for dealers via Stripe Connect:
 *  - Onboarding (Connect account creation)
 *  - Payment intents (card, terminal, ACH)
 *  - Refunds
 *  - Terminal reader management
 *  - Reconciliation helpers
 *  - Webhook event processing
 *
 * Stripe is the processing layer. We handle:
 *  - Mapping payments to deals/service ROs
 *  - Platform fee calculation
 *  - GL journal entry auto-posting
 *  - Analytics event tracking
 */

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type PaymentMethod = "card" | "ach" | "terminal" | "cash" | "check" | "bnpl";
export type PaymentStatus = "pending" | "processing" | "succeeded" | "failed" | "canceled" | "refunded" | "partially_refunded";
export type PaymentType = "deal" | "service" | "parts" | "deposit" | "fee" | "other";

export interface CreatePaymentRequest {
  dealer_stripe_account_id: string;
  amount: number;             // in cents
  currency?: string;
  payment_type: PaymentType;
  source_type?: string;
  source_id?: string;
  customer_name?: string;
  customer_email?: string;
  description?: string;
  metadata?: Record<string, string>;
  payment_method_type?: PaymentMethod;
  platform_fee_pct?: number;  // our platform fee percentage (default 2.9%)
}

export interface PaymentResult {
  payment_intent_id: string;
  client_secret: string;
  status: PaymentStatus;
  amount: number;
  currency: string;
  platform_fee: number;
  stripe_fee_estimate: number;
  net_amount: number;
}

export interface RefundRequest {
  payment_intent_id: string;
  amount?: number;  // partial refund amount in cents, or full if omitted
  reason?: "requested_by_customer" | "duplicate" | "fraudulent";
}

export interface RefundResult {
  refund_id: string;
  amount: number;
  status: string;
}

export interface StripeAccountStatus {
  account_id: string;
  charges_enabled: boolean;
  payouts_enabled: boolean;
  requirements: string[];
  onboarding_complete: boolean;
}

export interface ReconciliationSummary {
  date: string;
  total_transactions: number;
  total_collected: number;
  total_refunded: number;
  total_fees: number;
  net_amount: number;
  by_type: Record<PaymentType, { count: number; amount: number }>;
  by_method: Record<string, { count: number; amount: number }>;
}

/* ------------------------------------------------------------------ */
/*  Configuration                                                      */
/* ------------------------------------------------------------------ */

const DEFAULT_PLATFORM_FEE_PCT = 2.9;
const DEFAULT_CURRENCY = "usd";
const STRIPE_FEE_PCT = 2.9;
const STRIPE_FEE_FIXED = 30; // 30 cents

/* ------------------------------------------------------------------ */
/*  Stripe SDK Wrapper                                                 */
/* ------------------------------------------------------------------ */

/**
 * Get the Stripe client. Lazy-initialized.
 * Returns null if STRIPE_SECRET_KEY is not set (shadow mode).
 */
async function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;

  const Stripe = (await import("stripe")).default;
  return new Stripe(key, { apiVersion: "2024-12-18.acacia" as any });
}

/* ------------------------------------------------------------------ */
/*  Account Management                                                 */
/* ------------------------------------------------------------------ */

/**
 * Create a Stripe Connect account for a dealer.
 */
export async function createConnectAccount(
  dealerName: string,
  dealerEmail: string,
  returnUrl: string,
  refreshUrl: string,
): Promise<{ account_id: string; onboarding_url: string } | null> {
  const stripe = await getStripe();
  if (!stripe) return null;

  const account = await stripe.accounts.create({
    type: "standard",
    email: dealerEmail,
    business_profile: {
      name: dealerName,
      mcc: "5511", // Motor vehicle dealers (new and used)
    },
  });

  const accountLink = await stripe.accountLinks.create({
    account: account.id,
    type: "account_onboarding",
    return_url: returnUrl,
    refresh_url: refreshUrl,
  });

  return {
    account_id: account.id,
    onboarding_url: accountLink.url,
  };
}

/**
 * Check a Connect account's status.
 */
export async function getAccountStatus(
  accountId: string,
): Promise<StripeAccountStatus | null> {
  const stripe = await getStripe();
  if (!stripe) return null;

  const account = await stripe.accounts.retrieve(accountId);

  return {
    account_id: account.id,
    charges_enabled: account.charges_enabled ?? false,
    payouts_enabled: account.payouts_enabled ?? false,
    requirements: account.requirements?.currently_due ?? [],
    onboarding_complete: (account.requirements?.currently_due?.length ?? 0) === 0,
  };
}

/* ------------------------------------------------------------------ */
/*  Payment Processing                                                 */
/* ------------------------------------------------------------------ */

/**
 * Create a payment intent for a dealer transaction.
 */
export async function createPayment(
  request: CreatePaymentRequest,
): Promise<PaymentResult | null> {
  const stripe = await getStripe();
  if (!stripe) {
    // Shadow mode — return mock result
    return createMockPaymentResult(request);
  }

  const platformFeePct = request.platform_fee_pct ?? DEFAULT_PLATFORM_FEE_PCT;
  const platformFee = Math.round(request.amount * platformFeePct / 100);

  const intent = await stripe.paymentIntents.create(
    {
      amount: request.amount,
      currency: request.currency ?? DEFAULT_CURRENCY,
      description: request.description ?? `${request.payment_type} payment`,
      metadata: {
        payment_type: request.payment_type,
        source_type: request.source_type ?? "",
        source_id: request.source_id ?? "",
        customer_name: request.customer_name ?? "",
        ...request.metadata,
      },
      application_fee_amount: platformFee,
    },
    {
      stripeAccount: request.dealer_stripe_account_id,
    },
  );

  const stripeFeeEstimate = Math.round(request.amount * STRIPE_FEE_PCT / 100) + STRIPE_FEE_FIXED;

  return {
    payment_intent_id: intent.id,
    client_secret: intent.client_secret ?? "",
    status: mapStripeStatus(intent.status),
    amount: request.amount,
    currency: request.currency ?? DEFAULT_CURRENCY,
    platform_fee: platformFee,
    stripe_fee_estimate: stripeFeeEstimate,
    net_amount: request.amount - platformFee - stripeFeeEstimate,
  };
}

/**
 * Process a refund.
 */
export async function processRefund(
  request: RefundRequest,
  stripeAccountId: string,
): Promise<RefundResult | null> {
  const stripe = await getStripe();
  if (!stripe) {
    return { refund_id: `re_mock_${Date.now()}`, amount: request.amount ?? 0, status: "succeeded" };
  }

  const refund = await stripe.refunds.create(
    {
      payment_intent: request.payment_intent_id,
      amount: request.amount,
      reason: request.reason,
    },
    { stripeAccount: stripeAccountId },
  );

  return {
    refund_id: refund.id,
    amount: refund.amount,
    status: refund.status ?? "pending",
  };
}

/* ------------------------------------------------------------------ */
/*  Fee Calculation                                                    */
/* ------------------------------------------------------------------ */

/**
 * Calculate platform fee and estimated Stripe fee for a payment amount.
 */
export function calculateFees(amountCents: number, platformFeePct?: number): {
  amount: number;
  platform_fee: number;
  stripe_fee: number;
  net_to_dealer: number;
} {
  const pct = platformFeePct ?? DEFAULT_PLATFORM_FEE_PCT;
  const platform_fee = Math.round(amountCents * pct / 100);
  const stripe_fee = Math.round(amountCents * STRIPE_FEE_PCT / 100) + STRIPE_FEE_FIXED;
  const net_to_dealer = amountCents - platform_fee - stripe_fee;

  return { amount: amountCents, platform_fee, stripe_fee, net_to_dealer };
}

/* ------------------------------------------------------------------ */
/*  Reconciliation                                                     */
/* ------------------------------------------------------------------ */

/**
 * Build a daily reconciliation summary from transaction data.
 */
export function buildReconciliation(
  transactions: {
    amount: number;
    status: PaymentStatus;
    payment_type: PaymentType;
    payment_method: string;
    platform_fee: number;
    stripe_fee: number;
    is_refund?: boolean;
    refund_amount?: number;
  }[],
  date: string,
): ReconciliationSummary {
  const byType: Record<string, { count: number; amount: number }> = {};
  const byMethod: Record<string, { count: number; amount: number }> = {};
  let total_collected = 0;
  let total_refunded = 0;
  let total_fees = 0;

  for (const tx of transactions) {
    if (tx.status !== "succeeded" && tx.status !== "refunded" && tx.status !== "partially_refunded") {
      continue;
    }

    // By type
    if (!byType[tx.payment_type]) byType[tx.payment_type] = { count: 0, amount: 0 };
    byType[tx.payment_type].count++;
    byType[tx.payment_type].amount += tx.amount;

    // By method
    if (!byMethod[tx.payment_method]) byMethod[tx.payment_method] = { count: 0, amount: 0 };
    byMethod[tx.payment_method].count++;
    byMethod[tx.payment_method].amount += tx.amount;

    total_collected += tx.amount;
    total_fees += tx.platform_fee + tx.stripe_fee;

    if (tx.refund_amount) {
      total_refunded += tx.refund_amount;
    }
  }

  return {
    date,
    total_transactions: transactions.filter((t) => t.status === "succeeded").length,
    total_collected: Math.round(total_collected),
    total_refunded: Math.round(total_refunded),
    total_fees: Math.round(total_fees),
    net_amount: Math.round(total_collected - total_refunded - total_fees),
    by_type: byType as Record<PaymentType, { count: number; amount: number }>,
    by_method: byMethod,
  };
}

/* ------------------------------------------------------------------ */
/*  Provider Status                                                    */
/* ------------------------------------------------------------------ */

export function isStripeConfigured(): boolean {
  return !!process.env.STRIPE_SECRET_KEY;
}

export function getStripeStatus(): { configured: boolean; mode: string } {
  const key = process.env.STRIPE_SECRET_KEY ?? "";
  return {
    configured: !!key,
    mode: key.startsWith("sk_live_") ? "live" : key.startsWith("sk_test_") ? "test" : "none",
  };
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function mapStripeStatus(status: string): PaymentStatus {
  switch (status) {
    case "succeeded": return "succeeded";
    case "processing": return "processing";
    case "requires_payment_method":
    case "requires_confirmation":
    case "requires_action":
      return "pending";
    case "canceled": return "canceled";
    default: return "pending";
  }
}

function createMockPaymentResult(request: CreatePaymentRequest): PaymentResult {
  const platformFee = Math.round(request.amount * (request.platform_fee_pct ?? DEFAULT_PLATFORM_FEE_PCT) / 100);
  const stripeFee = Math.round(request.amount * STRIPE_FEE_PCT / 100) + STRIPE_FEE_FIXED;

  return {
    payment_intent_id: `pi_shadow_${Date.now()}`,
    client_secret: `pi_shadow_${Date.now()}_secret_mock`,
    status: "succeeded",
    amount: request.amount,
    currency: request.currency ?? DEFAULT_CURRENCY,
    platform_fee: platformFee,
    stripe_fee_estimate: stripeFee,
    net_amount: request.amount - platformFee - stripeFee,
  };
}
