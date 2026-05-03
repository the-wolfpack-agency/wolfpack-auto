/**
 * Deal-Desk Copilot — live recommendation orchestrator.
 *
 * Runs alongside the desk during active negotiation. Given a deal snapshot,
 * runs six deterministic suggestion generators in parallel and persists each
 * with the evidence that drove it. The desk manager's accept/reject feeds a
 * per-(dealer, generator) weight that biases future confidence scores.
 *
 * No LLM calls in this milestone — every generator is deterministic for the
 * same input. The generators ORCHESTRATE existing libs (fi-desking,
 * pricing-engine, market-pricing); they do NOT duplicate those libs' logic.
 *
 * Persistence layout (migration 059):
 *   deal_copilot_sessions          one row per copilot run
 *   deal_copilot_suggestions       one row per generator output
 *   deal_copilot_outcomes          terminal won/lost row, drives learning
 *   deal_copilot_generator_weights per-(dealer, generator) confidence weights
 *
 * Triple-write: each suggestion fans out to Qdrant (vector of payload+evidence)
 * and Neo4j (Deal-RECEIVED_SUGGESTION-CopilotSuggestion-GENERATED_BY-Generator).
 * Both are fire-and-forget — failures are logged, never block the PG write.
 */

import { randomUUID } from "node:crypto";
import {
  matchLenderPrograms,
  type DealStructure,
  type LenderMatch,
  type LenderProgram,
} from "@/lib/fi-desking";

/* ------------------------------------------------------------------ */
/*  Types                                                               */
/* ------------------------------------------------------------------ */

export type SuggestionType =
  | "rate_stack"
  | "payment_shape"
  | "msrp_discount"
  | "fi_product_attach"
  | "lender_swap"
  | "term_change"
  | "down_change";

export type SessionOutcome = "won" | "lost" | "pending";

export interface DealSnapshot {
  /** Selling price after any current discount */
  selling_price: number;
  msrp: number;
  invoice?: number;
  term_months: number;
  cash_down: number;
  apr: number;
  lender_name?: string;
  /** Buyer credit tier — 1 (best) to 5 (worst). Computed upstream from credit pull. */
  credit_tier: 1 | 2 | 3 | 4 | 5;
  credit_score: number;
  /** Currently attached F&I products (id list) */
  fi_products: string[];
  vehicle_type?: "new" | "used" | "cpo";
  vehicle_make?: string;
  vehicle_model?: string;
  vehicle_year?: number;
  vehicle_mileage?: number;
  /** Optional target monthly payment the buyer asked for */
  target_monthly?: number;
  /** Trade-in net (allowance - payoff). Positive lowers amount financed. */
  net_trade?: number;
  rebates?: number;
  doc_fee?: number;
  tax_rate?: number;
}

export interface SuggestionEvidence {
  cite: string;
  signals: Record<string, string | number | boolean>;
}

export interface CopilotSuggestion {
  id: string;
  session_id: string;
  dealer_id: string;
  suggestion_type: SuggestionType;
  generator: string;
  payload: Record<string, unknown>;
  evidence: SuggestionEvidence;
  confidence: number;
  accepted: boolean | null;
  suggested_at: string;
}

export interface CopilotSession {
  id: string;
  dealer_id: string;
  deal_id: string;
  opened_by_user_id: string;
  opened_at: string;
  closed_at: string | null;
  outcome: SessionOutcome | null;
  total_suggestions: number;
  accepted_suggestions: number;
}

export interface OpenSessionArgs {
  dealer_id: string;
  deal_id: string;
  opened_by_user_id: string;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                           */
/* ------------------------------------------------------------------ */

/** Tier rate floors used to decide "this lender is below tier" without
 *  forcing every dealer to seed lender_programs first. Real lender
 *  matches override these whenever programs are available. */
const TIER_RATE_FLOOR: Record<DealSnapshot["credit_tier"], number> = {
  1: 4.5,
  2: 6.5,
  3: 9.5,
  4: 13.5,
  5: 18.5,
};

/** Default attach-rate prior for F&I products by credit tier. Used when no
 *  dealer-specific learning signal is available yet. The four-product
 *  surface mirrors the existing F&I product menu in /admin/desking. */
const FI_PRODUCT_ATTACH_RATES: Record<DealSnapshot["credit_tier"], { id: string; name: string; attach_rate: number }[]> = {
  1: [
    { id: "warranty", name: "Extended Warranty", attach_rate: 0.42 },
    { id: "gap", name: "GAP Insurance", attach_rate: 0.18 },
    { id: "maint", name: "Prepaid Maintenance", attach_rate: 0.31 },
  ],
  2: [
    { id: "warranty", name: "Extended Warranty", attach_rate: 0.55 },
    { id: "gap", name: "GAP Insurance", attach_rate: 0.41 },
    { id: "tire", name: "Tire & Wheel Protection", attach_rate: 0.27 },
  ],
  3: [
    { id: "warranty", name: "Extended Warranty", attach_rate: 0.62 },
    { id: "gap", name: "GAP Insurance", attach_rate: 0.58 },
    { id: "maint", name: "Prepaid Maintenance", attach_rate: 0.34 },
  ],
  4: [
    { id: "gap", name: "GAP Insurance", attach_rate: 0.71 },
    { id: "warranty", name: "Extended Warranty", attach_rate: 0.49 },
    { id: "key", name: "Key Replacement", attach_rate: 0.22 },
  ],
  5: [
    { id: "gap", name: "GAP Insurance", attach_rate: 0.78 },
    { id: "warranty", name: "Extended Warranty", attach_rate: 0.31 },
  ],
};

const LEARNING_LIFT_PER_OUTCOME = 0.05;
const DEFAULT_GENERATOR_WEIGHT = 0.5;

const ALL_GENERATORS = [
  "rate_stack",
  "payment_shape",
  "msrp_discount",
  "fi_product_attach",
  "lender_swap",
  "term_change",
  "down_change",
] as const;

/* ------------------------------------------------------------------ */
/*  Session lifecycle                                                   */
/* ------------------------------------------------------------------ */

/**
 * Open a copilot session. Idempotent on (dealer_id, deal_id) — re-opening an
 * already-open session for the same deal returns the existing row.
 */
export async function openSession(
  args: OpenSessionArgs,
): Promise<CopilotSession> {
  const now = new Date().toISOString();
  if (!process.env.DATABASE_URL) {
    return synthesizeSession(args, now);
  }

  try {
    const { query } = await import("@/lib/db");
    const existing = await query<CopilotSessionRow>(
      `SELECT * FROM deal_copilot_sessions
        WHERE dealer_id = $1 AND deal_id = $2 AND closed_at IS NULL
        ORDER BY opened_at DESC LIMIT 1`,
      [args.dealer_id, args.deal_id],
    );
    if (existing.rows.length > 0) {
      return rowToSession(existing.rows[0]);
    }
    const inserted = await query<CopilotSessionRow>(
      `INSERT INTO deal_copilot_sessions
         (dealer_id, deal_id, opened_by_user_id, opened_at, outcome, total_suggestions, accepted_suggestions)
       VALUES ($1, $2, $3, NOW(), 'pending', 0, 0)
       RETURNING *`,
      [args.dealer_id, args.deal_id, args.opened_by_user_id],
    );
    return rowToSession(inserted.rows[0]);
  } catch (err) {
    if (isMissingTableError(err)) {
      return synthesizeSession(args, now);
    }
    throw err;
  }
}

export async function closeSession(
  sessionId: string,
  outcome: SessionOutcome,
): Promise<CopilotSession | null> {
  if (!process.env.DATABASE_URL) return null;
  try {
    const { query } = await import("@/lib/db");
    const result = await query<CopilotSessionRow>(
      `UPDATE deal_copilot_sessions
          SET closed_at = NOW(), outcome = $2
        WHERE id = $1
        RETURNING *`,
      [sessionId, outcome],
    );
    return result.rows.length > 0 ? rowToSession(result.rows[0]) : null;
  } catch (err) {
    if (isMissingTableError(err)) return null;
    throw err;
  }
}

/* ------------------------------------------------------------------ */
/*  Suggestion generation                                               */
/* ------------------------------------------------------------------ */

export interface GenerateOptions {
  /** Optional list of lender programs from `lender_programs`. When supplied,
   *  the rate_stack and lender_swap generators use these instead of synthetic
   *  tier-rate floors. */
  lender_programs?: LenderProgram[];
  /** Optional market price (median) for the snapshot's vehicle. When supplied,
   *  the msrp_discount generator compares the current selling price against it. */
  market_median_price?: number;
}

/**
 * Run all six generators in parallel and persist each output.
 * Returns the inserted suggestion rows (including in-memory shadow rows when
 * the table is missing — never throws).
 */
export async function generateSuggestions(
  sessionId: string,
  dealerId: string,
  snapshot: DealSnapshot,
  options: GenerateOptions = {},
): Promise<CopilotSuggestion[]> {
  const weights = await loadGeneratorWeights(dealerId);

  const [
    rateStack,
    paymentShape,
    msrpDiscount,
    fiAttach,
    lenderSwap,
    termChange,
    downChange,
  ] = await Promise.all([
    suggestRateStack(snapshot, options),
    suggestPaymentShape(snapshot),
    suggestMsrpDiscount(snapshot, options),
    suggestFiProductAttach(snapshot),
    suggestLenderSwap(snapshot, options),
    suggestTermChange(snapshot),
    suggestDownChange(snapshot),
  ]);

  const drafts: SuggestionDraft[] = [
    ...rateStack,
    ...paymentShape,
    ...msrpDiscount,
    ...fiAttach,
    ...lenderSwap,
    ...termChange,
    ...downChange,
  ].map((d) => ({
    ...d,
    confidence: weights[d.generator] ?? DEFAULT_GENERATOR_WEIGHT,
  }));

  return persistSuggestions(sessionId, dealerId, drafts);
}

/* ------------------------------------------------------------------ */
/*  Generator: rate_stack                                               */
/* ------------------------------------------------------------------ */

interface SuggestionDraft {
  suggestion_type: SuggestionType;
  generator: string;
  payload: Record<string, unknown>;
  evidence: SuggestionEvidence;
  /** Filled in by the orchestrator after weight lookup. */
  confidence?: number;
}

export async function suggestRateStack(
  snapshot: DealSnapshot,
  options: GenerateOptions = {},
): Promise<SuggestionDraft[]> {
  const programs = options.lender_programs ?? [];
  const amount = Math.max(0, snapshot.selling_price - snapshot.cash_down - (snapshot.net_trade ?? 0));

  if (programs.length > 0) {
    const matches = matchLenderPrograms(programs, snapshot.credit_score, amount, snapshot.term_months);
    const better = matches
      .filter((m) => m.apr < snapshot.apr - 0.01)
      .slice(0, 3);
    return better.map<SuggestionDraft>((match) => ({
      suggestion_type: "rate_stack",
      generator: "rate_stack",
      payload: {
        lender_name: match.lender_name,
        program_name: match.program_name,
        new_apr: match.apr,
        apr_delta: round2(match.apr - snapshot.apr),
        reserve_profit: match.reserve_profit,
      },
      evidence: {
        cite: `Switch to ${match.lender_name} — beats current APR by ${formatPct(snapshot.apr - match.apr)} for this credit tier`,
        signals: {
          current_apr: snapshot.apr,
          proposed_apr: match.apr,
          credit_score: snapshot.credit_score,
          lender_match: match.lender_name,
        },
      },
    }));
  }

  // No lender programs — synthesize a tier-floor suggestion if current is materially above floor.
  const floor = TIER_RATE_FLOOR[snapshot.credit_tier];
  if (snapshot.apr > floor + 0.5) {
    return [{
      suggestion_type: "rate_stack",
      generator: "rate_stack",
      payload: {
        lender_name: "tier-floor",
        program_name: `Tier ${snapshot.credit_tier} prime`,
        new_apr: floor,
        apr_delta: round2(floor - snapshot.apr),
      },
      evidence: {
        cite: `Tier-${snapshot.credit_tier} buyers typically secure ${formatPct(floor)} or better — current ${formatPct(snapshot.apr)} is above the floor`,
        signals: {
          current_apr: snapshot.apr,
          tier_floor_apr: floor,
          credit_tier: snapshot.credit_tier,
        },
      },
    }];
  }
  return [];
}

/* ------------------------------------------------------------------ */
/*  Generator: payment_shape                                            */
/* ------------------------------------------------------------------ */

export async function suggestPaymentShape(
  snapshot: DealSnapshot,
): Promise<SuggestionDraft[]> {
  if (!snapshot.target_monthly || snapshot.target_monthly <= 0) return [];

  const amountFinanced = Math.max(0, snapshot.selling_price - snapshot.cash_down - (snapshot.net_trade ?? 0));

  const candidates: { term: number; down_delta: number }[] = [
    { term: 60, down_delta: 1000 },
    { term: 72, down_delta: 0 },
    { term: 84, down_delta: -500 },
  ];

  const drafts: SuggestionDraft[] = [];
  for (const c of candidates) {
    const newDown = Math.max(0, snapshot.cash_down + c.down_delta);
    const newAmount = Math.max(0, snapshot.selling_price - newDown - (snapshot.net_trade ?? 0));
    const monthly = monthlyPayment(newAmount, snapshot.apr, c.term);
    if (Math.abs(monthly - snapshot.target_monthly) <= 25) {
      drafts.push({
        suggestion_type: "payment_shape",
        generator: "payment_shape",
        payload: {
          term_months: c.term,
          cash_down: newDown,
          monthly_payment: round2(monthly),
          target_monthly: snapshot.target_monthly,
          delta: round2(monthly - snapshot.target_monthly),
        },
        evidence: {
          cite: `${c.term}-month at $${newDown.toLocaleString()} down lands at $${Math.round(monthly)}/mo — within $25 of buyer's target`,
          signals: {
            target_monthly: snapshot.target_monthly,
            proposed_monthly: round2(monthly),
            term: c.term,
            down: newDown,
          },
        },
      });
    }
  }
  // If none hit ±$25, still return the closest one as a "miss but closest" cue.
  if (drafts.length === 0) {
    let closest = candidates[0];
    let closestMonthly = monthlyPayment(amountFinanced, snapshot.apr, closest.term);
    let closestDelta = Math.abs(closestMonthly - snapshot.target_monthly);
    for (const c of candidates) {
      const newDown = Math.max(0, snapshot.cash_down + c.down_delta);
      const newAmount = Math.max(0, snapshot.selling_price - newDown - (snapshot.net_trade ?? 0));
      const m = monthlyPayment(newAmount, snapshot.apr, c.term);
      const d = Math.abs(m - snapshot.target_monthly);
      if (d < closestDelta) {
        closest = c;
        closestMonthly = m;
        closestDelta = d;
      }
    }
    const newDown = Math.max(0, snapshot.cash_down + closest.down_delta);
    drafts.push({
      suggestion_type: "payment_shape",
      generator: "payment_shape",
      payload: {
        term_months: closest.term,
        cash_down: newDown,
        monthly_payment: round2(closestMonthly),
        target_monthly: snapshot.target_monthly,
        delta: round2(closestMonthly - snapshot.target_monthly),
        within_target_window: false,
      },
      evidence: {
        cite: `Closest payment to target $${snapshot.target_monthly}/mo is $${Math.round(closestMonthly)}/mo at ${closest.term} months`,
        signals: {
          target_monthly: snapshot.target_monthly,
          proposed_monthly: round2(closestMonthly),
          delta: round2(closestMonthly - snapshot.target_monthly),
        },
      },
    });
  }
  return drafts;
}

/* ------------------------------------------------------------------ */
/*  Generator: msrp_discount                                            */
/* ------------------------------------------------------------------ */

export async function suggestMsrpDiscount(
  snapshot: DealSnapshot,
  options: GenerateOptions = {},
): Promise<SuggestionDraft[]> {
  let median = options.market_median_price;

  if (!median && snapshot.vehicle_make && snapshot.vehicle_model && snapshot.vehicle_year) {
    try {
      const { estimateMarketPrice } = await import("@/lib/market-pricing");
      const condition = snapshot.vehicle_type === "new" ? "excellent" : "good";
      const mileage = snapshot.vehicle_mileage ?? (snapshot.vehicle_type === "new" ? 0 : 30000);
      const est = estimateMarketPrice(
        snapshot.vehicle_make,
        snapshot.vehicle_model,
        snapshot.vehicle_year,
        mileage,
        condition,
      );
      if (est.estimatedPrice > 0) median = est.estimatedPrice;
    } catch {
      // market-pricing unavailable — silently skip
    }
  }

  if (!median) return [];

  if (snapshot.selling_price > median * 1.03) {
    const target = Math.round(median * 1.005);
    const discount = snapshot.selling_price - target;
    return [{
      suggestion_type: "msrp_discount",
      generator: "msrp_discount",
      payload: {
        proposed_selling_price: target,
        discount_amount: discount,
        market_median_price: median,
        above_market_pct: round4((snapshot.selling_price - median) / median),
      },
      evidence: {
        cite: `Current price is ${formatPct(((snapshot.selling_price - median) / median) * 100)} above local-market median ($${median.toLocaleString()}). Drop to $${target.toLocaleString()} to hit market.`,
        signals: {
          current_price: snapshot.selling_price,
          market_median: median,
          proposed_price: target,
          discount: discount,
        },
      },
    }];
  }
  return [];
}

/* ------------------------------------------------------------------ */
/*  Generator: fi_product_attach                                        */
/* ------------------------------------------------------------------ */

export async function suggestFiProductAttach(
  snapshot: DealSnapshot,
): Promise<SuggestionDraft[]> {
  const candidates = FI_PRODUCT_ATTACH_RATES[snapshot.credit_tier] ?? [];
  const already = new Set(snapshot.fi_products);
  const drafts: SuggestionDraft[] = [];
  for (const c of candidates) {
    if (already.has(c.id)) continue;
    drafts.push({
      suggestion_type: "fi_product_attach",
      generator: "fi_product_attach",
      payload: {
        product_id: c.id,
        product_name: c.name,
        attach_rate: c.attach_rate,
        credit_tier: snapshot.credit_tier,
      },
      evidence: {
        cite: `${c.name} attaches on ${formatPct(c.attach_rate * 100)} of tier-${snapshot.credit_tier} deals — strong fit for this buyer profile`,
        signals: {
          attach_rate: c.attach_rate,
          credit_tier: snapshot.credit_tier,
          product_id: c.id,
        },
      },
    });
    if (drafts.length >= 3) break;
  }
  return drafts;
}

/* ------------------------------------------------------------------ */
/*  Generator: lender_swap                                              */
/* ------------------------------------------------------------------ */

export async function suggestLenderSwap(
  snapshot: DealSnapshot,
  options: GenerateOptions = {},
): Promise<SuggestionDraft[]> {
  const floor = TIER_RATE_FLOOR[snapshot.credit_tier];
  // Fire only when the current APR is materially above the tier floor — a sign
  // the current lender is not tier-matched. Rate-stack covers small deltas.
  if (snapshot.apr <= floor + 1.5) return [];

  const programs = options.lender_programs ?? [];
  const amount = Math.max(0, snapshot.selling_price - snapshot.cash_down - (snapshot.net_trade ?? 0));
  let best: LenderMatch | null = null;
  if (programs.length > 0) {
    const matches = matchLenderPrograms(programs, snapshot.credit_score, amount, snapshot.term_months);
    best = matches[0] ?? null;
  }

  return [{
    suggestion_type: "lender_swap",
    generator: "lender_swap",
    payload: {
      current_lender: snapshot.lender_name ?? "unknown",
      proposed_lender: best?.lender_name ?? "tier-match-needed",
      current_apr: snapshot.apr,
      proposed_apr: best?.apr ?? floor,
      reason: "tier_mismatch",
    },
    evidence: {
      cite: best
        ? `${snapshot.lender_name ?? "Current lender"} is pricing tier-${snapshot.credit_tier} like a worse risk. ${best.lender_name} offers ${formatPct(best.apr)} on the same buyer.`
        : `${snapshot.lender_name ?? "Current lender"} APR ${formatPct(snapshot.apr)} sits well above tier-${snapshot.credit_tier} floor (${formatPct(floor)}). Re-shop the deal.`,
      signals: {
        credit_tier: snapshot.credit_tier,
        current_apr: snapshot.apr,
        tier_floor: floor,
      },
    },
  }];
}

/* ------------------------------------------------------------------ */
/*  Generator: term_change                                              */
/* ------------------------------------------------------------------ */

export async function suggestTermChange(
  snapshot: DealSnapshot,
): Promise<SuggestionDraft[]> {
  if (!snapshot.target_monthly || snapshot.target_monthly <= 0) return [];
  const amount = Math.max(0, snapshot.selling_price - snapshot.cash_down - (snapshot.net_trade ?? 0));
  const current = monthlyPayment(amount, snapshot.apr, snapshot.term_months);
  if (current <= snapshot.target_monthly) return [];

  for (const t of [72, 84, 96]) {
    if (t <= snapshot.term_months) continue;
    const m = monthlyPayment(amount, snapshot.apr, t);
    if (m <= snapshot.target_monthly + 5) {
      return [{
        suggestion_type: "term_change",
        generator: "term_change",
        payload: {
          new_term_months: t,
          new_monthly_payment: round2(m),
          old_term_months: snapshot.term_months,
          old_monthly_payment: round2(current),
        },
        evidence: {
          cite: `Stretching the term to ${t} months drops the payment to $${Math.round(m)}/mo, hitting the buyer's $${snapshot.target_monthly} target`,
          signals: {
            old_term: snapshot.term_months,
            new_term: t,
            target_monthly: snapshot.target_monthly,
            proposed_monthly: round2(m),
          },
        },
      }];
    }
  }
  return [];
}

/* ------------------------------------------------------------------ */
/*  Generator: down_change                                              */
/* ------------------------------------------------------------------ */

export async function suggestDownChange(
  snapshot: DealSnapshot,
): Promise<SuggestionDraft[]> {
  if (!snapshot.target_monthly || snapshot.target_monthly <= 0) return [];

  const baseAmount = Math.max(0, snapshot.selling_price - (snapshot.net_trade ?? 0));
  const currentAmount = Math.max(0, baseAmount - snapshot.cash_down);
  const currentMonthly = monthlyPayment(currentAmount, snapshot.apr, snapshot.term_months);
  if (currentMonthly <= snapshot.target_monthly + 5) return [];

  // Closed-form: target = monthly_payment(amount, apr, n)  →  amount required.
  const r = snapshot.apr / 100 / 12;
  const n = snapshot.term_months;
  let amountRequired: number;
  if (r > 0) {
    amountRequired = (snapshot.target_monthly * (Math.pow(1 + r, n) - 1)) / (r * Math.pow(1 + r, n));
  } else {
    amountRequired = snapshot.target_monthly * n;
  }
  const proposedDown = Math.max(0, baseAmount - amountRequired);
  if (proposedDown <= snapshot.cash_down) return [];

  return [{
    suggestion_type: "down_change",
    generator: "down_change",
    payload: {
      new_cash_down: round2(proposedDown),
      old_cash_down: snapshot.cash_down,
      additional_down: round2(proposedDown - snapshot.cash_down),
      target_monthly: snapshot.target_monthly,
    },
    evidence: {
      cite: `Adding $${Math.round(proposedDown - snapshot.cash_down).toLocaleString()} to cash down hits the buyer's $${snapshot.target_monthly}/mo target without changing term or rate`,
      signals: {
        old_down: snapshot.cash_down,
        new_down: round2(proposedDown),
        target_monthly: snapshot.target_monthly,
      },
    },
  }];
}

/* ------------------------------------------------------------------ */
/*  Persistence + accept/reject                                         */
/* ------------------------------------------------------------------ */

async function persistSuggestions(
  sessionId: string,
  dealerId: string,
  drafts: SuggestionDraft[],
): Promise<CopilotSuggestion[]> {
  if (drafts.length === 0) return [];

  const out: CopilotSuggestion[] = [];

  if (process.env.DATABASE_URL) {
    try {
      const { query } = await import("@/lib/db");
      for (const d of drafts) {
        const { rows } = await query<CopilotSuggestionRow>(
          `INSERT INTO deal_copilot_suggestions
             (session_id, dealer_id, suggestion_type, generator, payload, evidence, confidence)
           VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7)
           RETURNING *`,
          [
            sessionId,
            dealerId,
            d.suggestion_type,
            d.generator,
            JSON.stringify(d.payload),
            JSON.stringify(d.evidence),
            d.confidence ?? DEFAULT_GENERATOR_WEIGHT,
          ],
        );
        if (rows[0]) out.push(rowToSuggestion(rows[0]));
      }
      await query(
        `UPDATE deal_copilot_sessions
            SET total_suggestions = total_suggestions + $2
          WHERE id = $1`,
        [sessionId, drafts.length],
      );
    } catch (err) {
      if (!isMissingTableError(err)) throw err;
      // table missing → fall through to synthesizing
    }
  }

  if (out.length === 0) {
    for (const d of drafts) out.push(synthesizeSuggestion(sessionId, dealerId, d));
  }

  // Triple-write fan-out — fire-and-forget. Do NOT await.
  void fanOutSuggestions(out).catch(() => undefined);

  return out;
}

export async function acceptSuggestion(
  id: string,
  userId: string,
): Promise<CopilotSuggestion | null> {
  if (!process.env.DATABASE_URL) return null;
  try {
    const { query } = await import("@/lib/db");
    const result = await query<CopilotSuggestionRow>(
      `UPDATE deal_copilot_suggestions
          SET accepted = TRUE, accepted_at = NOW(), accepted_by_user_id = $2
        WHERE id = $1 AND accepted IS NULL
        RETURNING *`,
      [id, userId],
    );
    if (result.rows.length === 0) return null;
    const suggestion = rowToSuggestion(result.rows[0]);
    await query(
      `UPDATE deal_copilot_sessions
          SET accepted_suggestions = accepted_suggestions + 1
        WHERE id = $1`,
      [suggestion.session_id],
    );
    return suggestion;
  } catch (err) {
    if (isMissingTableError(err)) return null;
    throw err;
  }
}

export async function rejectSuggestion(
  id: string,
  reason: string,
): Promise<CopilotSuggestion | null> {
  if (!process.env.DATABASE_URL) return null;
  try {
    const { query } = await import("@/lib/db");
    const result = await query<CopilotSuggestionRow>(
      `UPDATE deal_copilot_suggestions
          SET accepted = FALSE, rejection_reason = $2
        WHERE id = $1 AND accepted IS NULL
        RETURNING *`,
      [id, reason],
    );
    return result.rows.length > 0 ? rowToSuggestion(result.rows[0]) : null;
  } catch (err) {
    if (isMissingTableError(err)) return null;
    throw err;
  }
}

/* ------------------------------------------------------------------ */
/*  Outcome + learning loop                                             */
/* ------------------------------------------------------------------ */

export interface RecordOutcomeArgs {
  session_id: string;
  dealer_id: string;
  outcome: "won" | "lost";
  close_reason?: string;
  gross_profit_cents?: number;
}

export async function recordOutcome(
  args: RecordOutcomeArgs,
): Promise<{ outcome_id: string | null; weights_updated: number }> {
  if (!process.env.DATABASE_URL) {
    return { outcome_id: null, weights_updated: 0 };
  }

  const { query } = await import("@/lib/db");

  let acceptedIds: string[] = [];
  let acceptedGenerators: string[] = [];
  try {
    const accepted = await query<{ id: string; generator: string }>(
      `SELECT id, generator FROM deal_copilot_suggestions
        WHERE session_id = $1 AND accepted = TRUE`,
      [args.session_id],
    );
    acceptedIds = accepted.rows.map((r) => r.id);
    acceptedGenerators = accepted.rows.map((r) => r.generator);
  } catch (err) {
    if (!isMissingTableError(err)) throw err;
  }

  let outcomeId: string | null = null;
  try {
    const result = await query<{ id: string }>(
      `INSERT INTO deal_copilot_outcomes
         (session_id, dealer_id, outcome, close_reason, gross_profit_cents, accepted_suggestion_ids)
       VALUES ($1, $2, $3, $4, $5, $6::uuid[])
       RETURNING id`,
      [
        args.session_id,
        args.dealer_id,
        args.outcome,
        args.close_reason ?? null,
        args.gross_profit_cents ?? null,
        acceptedIds,
      ],
    );
    outcomeId = result.rows[0]?.id ?? null;
  } catch (err) {
    if (!isMissingTableError(err)) throw err;
  }

  // Close the session row.
  try {
    await query(
      `UPDATE deal_copilot_sessions
          SET closed_at = NOW(), outcome = $2
        WHERE id = $1`,
      [args.session_id, args.outcome],
    );
  } catch (err) {
    if (!isMissingTableError(err)) throw err;
  }

  // Bump weights. Win raises every accepted-generator weight by
  // LEARNING_LIFT_PER_OUTCOME (capped at 1); loss lowers it by the same delta
  // (floored at 0). The ratio (wins / total) is also written so downstream
  // analytics can recover the raw counts.
  const delta = args.outcome === "won" ? LEARNING_LIFT_PER_OUTCOME : -LEARNING_LIFT_PER_OUTCOME;
  const winInc = args.outcome === "won" ? 1 : 0;
  const lossInc = args.outcome === "lost" ? 1 : 0;

  let weightsUpdated = 0;
  for (const gen of new Set(acceptedGenerators)) {
    try {
      await query(
        `INSERT INTO deal_copilot_generator_weights
           (dealer_id, generator, weight, win_count, loss_count, last_updated_at)
         VALUES ($1, $2, GREATEST(0, LEAST(1, $3 + $4)), $5, $6, NOW())
         ON CONFLICT (dealer_id, generator) DO UPDATE
           SET weight = GREATEST(0, LEAST(1, deal_copilot_generator_weights.weight + $4)),
               win_count = deal_copilot_generator_weights.win_count + $5,
               loss_count = deal_copilot_generator_weights.loss_count + $6,
               last_updated_at = NOW()`,
        [args.dealer_id, gen, DEFAULT_GENERATOR_WEIGHT, delta, winInc, lossInc],
      );
      weightsUpdated += 1;
    } catch (err) {
      if (!isMissingTableError(err)) throw err;
    }
  }

  return { outcome_id: outcomeId, weights_updated: weightsUpdated };
}

async function loadGeneratorWeights(
  dealerId: string,
): Promise<Record<string, number>> {
  const defaults: Record<string, number> = {};
  for (const g of ALL_GENERATORS) defaults[g] = DEFAULT_GENERATOR_WEIGHT;
  if (!process.env.DATABASE_URL) return defaults;

  try {
    const { query } = await import("@/lib/db");
    const { rows } = await query<{ generator: string; weight: string }>(
      `SELECT generator, weight FROM deal_copilot_generator_weights WHERE dealer_id = $1`,
      [dealerId],
    );
    for (const r of rows) {
      defaults[r.generator] = clamp01(parseFloat(r.weight));
    }
  } catch (err) {
    if (!isMissingTableError(err)) throw err;
  }
  return defaults;
}

/* ------------------------------------------------------------------ */
/*  Triple-write fan-out                                                */
/* ------------------------------------------------------------------ */

async function fanOutSuggestions(suggestions: CopilotSuggestion[]): Promise<void> {
  if (suggestions.length === 0) return;

  // Qdrant — metadata point per suggestion. Vector is a fixed zero-vec; the
  // payload carries the searchable fields. Mirrors the triple-write pattern.
  if (process.env.QDRANT_URL) {
    try {
      const { upsertPoints, createCollection } = await import("@/lib/qdrant-client");
      const COLLECTION = "wolfpack_copilot_suggestions";
      await createCollection(COLLECTION, 4);
      await upsertPoints(
        COLLECTION,
        suggestions.map((s) => ({
          id: hashStringId(s.id),
          vector: [0, 0, 0, 0],
          payload: {
            id: s.id,
            session_id: s.session_id,
            dealer_id: s.dealer_id,
            suggestion_type: s.suggestion_type,
            generator: s.generator,
            payload: JSON.stringify(s.payload),
            evidence_cite: s.evidence.cite,
            confidence: s.confidence,
            suggested_at: s.suggested_at,
          },
        })),
      );
    } catch (err) {
      console.warn(
        "[deal-copilot] Qdrant fan-out failed (non-blocking):",
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  // Neo4j — Deal-RECEIVED_SUGGESTION-CopilotSuggestion-GENERATED_BY-Generator.
  const neo4jUrl = process.env.NEO4J_URI || process.env.NEO4J_URL;
  if (neo4jUrl) {
    try {
      const { executeNeo4jQueries } = await import("@/lib/neo4j-client");
      await executeNeo4jQueries(suggestions.map((s) => ({
        statement: `
          MERGE (d:Deal {dealer_id: $dealerId, session_id: $sessionId})
          MERGE (g:Generator {name: $generator})
          MERGE (s:CopilotSuggestion {id: $id})
            SET s.suggestion_type = $type,
                s.confidence = $confidence,
                s.suggested_at = $suggestedAt,
                s.evidence = $evidence
          MERGE (d)-[:RECEIVED_SUGGESTION]->(s)
          MERGE (s)-[:GENERATED_BY]->(g)
        `,
        parameters: {
          id: s.id,
          dealerId: s.dealer_id,
          sessionId: s.session_id,
          generator: s.generator,
          type: s.suggestion_type,
          confidence: s.confidence,
          suggestedAt: s.suggested_at,
          evidence: s.evidence.cite,
        },
      })));
    } catch (err) {
      console.warn(
        "[deal-copilot] Neo4j fan-out failed (non-blocking):",
        err instanceof Error ? err.message : String(err),
      );
    }
  }
}

/* ------------------------------------------------------------------ */
/*  Internal helpers                                                    */
/* ------------------------------------------------------------------ */

interface CopilotSessionRow {
  id: string;
  dealer_id: string;
  deal_id: string;
  opened_by_user_id: string;
  opened_at: string | Date;
  closed_at: string | Date | null;
  outcome: SessionOutcome | null;
  total_suggestions: number;
  accepted_suggestions: number;
}

interface CopilotSuggestionRow {
  id: string;
  session_id: string;
  dealer_id: string;
  suggestion_type: SuggestionType;
  generator: string;
  payload: Record<string, unknown> | string;
  evidence: SuggestionEvidence | string;
  confidence: number | string;
  accepted: boolean | null;
  suggested_at: string | Date;
}

function rowToSession(r: CopilotSessionRow): CopilotSession {
  return {
    id: r.id,
    dealer_id: r.dealer_id,
    deal_id: r.deal_id,
    opened_by_user_id: r.opened_by_user_id,
    opened_at: typeof r.opened_at === "string" ? r.opened_at : r.opened_at.toISOString(),
    closed_at: r.closed_at
      ? typeof r.closed_at === "string"
        ? r.closed_at
        : r.closed_at.toISOString()
      : null,
    outcome: r.outcome,
    total_suggestions: Number(r.total_suggestions ?? 0),
    accepted_suggestions: Number(r.accepted_suggestions ?? 0),
  };
}

function rowToSuggestion(r: CopilotSuggestionRow): CopilotSuggestion {
  const payload = typeof r.payload === "string" ? JSON.parse(r.payload) : r.payload;
  const evidence = typeof r.evidence === "string"
    ? (JSON.parse(r.evidence) as SuggestionEvidence)
    : r.evidence;
  return {
    id: r.id,
    session_id: r.session_id,
    dealer_id: r.dealer_id,
    suggestion_type: r.suggestion_type,
    generator: r.generator,
    payload,
    evidence,
    confidence: Number(r.confidence ?? DEFAULT_GENERATOR_WEIGHT),
    accepted: r.accepted ?? null,
    suggested_at: typeof r.suggested_at === "string" ? r.suggested_at : r.suggested_at.toISOString(),
  };
}

function synthesizeSession(args: OpenSessionArgs, now: string): CopilotSession {
  return {
    // Crypto-strong UUID — these IDs surface in API responses and audit logs.
    id: `shadow-${Date.now()}-${randomUUID()}`,
    dealer_id: args.dealer_id,
    deal_id: args.deal_id,
    opened_by_user_id: args.opened_by_user_id,
    opened_at: now,
    closed_at: null,
    outcome: "pending",
    total_suggestions: 0,
    accepted_suggestions: 0,
  };
}

function synthesizeSuggestion(
  sessionId: string,
  dealerId: string,
  draft: SuggestionDraft,
): CopilotSuggestion {
  return {
    id: `shadow-${Date.now()}-${randomUUID()}`,
    session_id: sessionId,
    dealer_id: dealerId,
    suggestion_type: draft.suggestion_type,
    generator: draft.generator,
    payload: draft.payload,
    evidence: draft.evidence,
    confidence: draft.confidence ?? DEFAULT_GENERATOR_WEIGHT,
    accepted: null,
    suggested_at: new Date().toISOString(),
  };
}

function isMissingTableError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.includes("does not exist");
}

function monthlyPayment(principal: number, aprPct: number, n: number): number {
  if (principal <= 0 || n <= 0) return 0;
  if (aprPct <= 0) return principal / n;
  const r = aprPct / 100 / 12;
  return (principal * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

function clamp01(n: number): number {
  if (Number.isNaN(n)) return DEFAULT_GENERATOR_WEIGHT;
  return Math.max(0, Math.min(1, n));
}

function formatPct(n: number): string {
  return `${n.toFixed(2)}%`;
}

function hashStringId(raw: string): number {
  let hash = 0;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw.charCodeAt(i);
    hash = (hash << 5) - hash + ch;
    hash |= 0;
  }
  return Math.abs(hash);
}

/** Re-exported so callers (and tests) can know the full generator set. */
export const COPILOT_GENERATORS = ALL_GENERATORS;

/** Exported only for tests: lets unit tests inspect the deterministic floors. */
export const __TEST__ = {
  TIER_RATE_FLOOR,
  FI_PRODUCT_ATTACH_RATES,
  LEARNING_LIFT_PER_OUTCOME,
  DEFAULT_GENERATOR_WEIGHT,
};
