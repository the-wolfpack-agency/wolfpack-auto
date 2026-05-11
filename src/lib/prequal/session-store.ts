/**
 * Persistence layer for the pre-qualification flow.
 *
 * Wraps Postgres reads/writes for prequal_sessions / soft_credit_pulls /
 * plaid_links / prequal_offers (migration 067). Encrypts sensitive columns
 * via src/lib/crypto.ts before write. Triggers triple-write fan-out + audit
 * log entries on every state transition.
 *
 * Route handlers should call into here -- they should NEVER touch the DB
 * directly for these tables, since that's how raw-response leaks happen.
 */

import { query } from "@/lib/db";
import { encryptPII, decryptPII } from "@/lib/crypto";
import { auditLog } from "@/lib/audit-log";
import { trackPrequal } from "@/lib/analytics-hooks";
import { writeEventsToSecondaryStores } from "@/lib/triple-write";
import type { AnalyticsEvent } from "@/lib/analytics-engine";
import type { CreditResult, IncomeResult, PrequalOffer } from "./types";

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

export type PrequalStatus =
  | "started"
  | "credit_pulled"
  | "income_verified"
  | "offers_returned"
  | "completed"
  | "abandoned";

export interface PrequalSessionRow {
  id: string;
  dealer_id: string;
  customer_name: string;
  customer_email: string; // plaintext after decrypt
  customer_phone: string | null;
  vehicle_interest_text: string;
  status: PrequalStatus;
  started_at: string;
  completed_at: string | null;
  ip_address: string | null;
  user_agent: string | null;
}

export interface CreateSessionInput {
  dealerId: string;
  customerName: string;
  customerEmail: string;
  customerPhone?: string | null;
  vehicleInterestText: string;
  ipAddress?: string | null;
  userAgent?: string | null;
}

/* -------------------------------------------------------------------------- */
/* Triple-write helpers                                                       */
/* -------------------------------------------------------------------------- */

function fanoutEvent(
  action: string,
  dealerId: string,
  sessionId: string,
  metadata: Record<string, string | number | boolean>,
): void {
  // Fire-and-forget. Never block the HTTP path.
  const ev: AnalyticsEvent = {
    event_type: "prequal",
    action,
    page: "/pre-qual",
    session_id: sessionId,
    user_fingerprint: "server",
    timestamp: new Date().toISOString(),
    metadata: { ...metadata, dealer_id: dealerId },
  };
  void writeEventsToSecondaryStores([ev]).catch(() => {
    /* triple-write must never throw */
  });
}

/* -------------------------------------------------------------------------- */
/* CREATE: prequal_sessions                                                   */
/* -------------------------------------------------------------------------- */

export async function createSession(
  input: CreateSessionInput,
): Promise<{ id: string; startedAt: string }> {
  const encryptedEmail = encryptPII(input.customerEmail.toLowerCase().trim());
  const encryptedPhone = input.customerPhone?.trim()
    ? encryptPII(input.customerPhone.trim())
    : null;

  const result = await query<{ id: string; started_at: string }>(
    `INSERT INTO prequal_sessions (
       dealer_id, customer_name, customer_email, customer_phone,
       vehicle_interest_text, status, ip_address, user_agent
     ) VALUES (
       $1, $2, $3, $4, $5, 'started', $6, $7
     ) RETURNING id, started_at`,
    [
      input.dealerId,
      input.customerName,
      encryptedEmail,
      encryptedPhone,
      input.vehicleInterestText,
      input.ipAddress ?? null,
      input.userAgent ?? null,
    ],
  );

  const created = result.rows[0];

  trackPrequal("prequal.started", input.dealerId, {
    session_id: created.id,
    has_phone: !!input.customerPhone,
    vehicle_interest_length: input.vehicleInterestText.length,
  });
  void auditLog(
    "prequal.session.created",
    { session_id: created.id, dealer_id: input.dealerId },
    undefined,
    input.dealerId,
    input.ipAddress ?? undefined,
  );
  fanoutEvent("prequal.started", input.dealerId, created.id, {
    has_phone: !!input.customerPhone,
  });

  return { id: created.id, startedAt: created.started_at };
}

/* -------------------------------------------------------------------------- */
/* READ                                                                       */
/* -------------------------------------------------------------------------- */

export async function getSession(
  sessionId: string,
): Promise<PrequalSessionRow | null> {
  const result = await query<{
    id: string;
    dealer_id: string;
    customer_name: string;
    customer_email: string;
    customer_phone: string | null;
    vehicle_interest_text: string;
    status: PrequalStatus;
    started_at: string;
    completed_at: string | null;
    ip_address: string | null;
    user_agent: string | null;
  }>(
    `SELECT id, dealer_id, customer_name, customer_email, customer_phone,
            vehicle_interest_text, status, started_at, completed_at,
            ip_address, user_agent
       FROM prequal_sessions
      WHERE id = $1
      LIMIT 1`,
    [sessionId],
  );

  if (result.rows.length === 0) return null;
  const row = result.rows[0];
  return {
    ...row,
    customer_email: decryptPII(row.customer_email),
    customer_phone: row.customer_phone ? decryptPII(row.customer_phone) : null,
  };
}

/* -------------------------------------------------------------------------- */
/* STATE TRANSITIONS                                                          */
/* -------------------------------------------------------------------------- */

async function transition(
  sessionId: string,
  dealerId: string,
  next: PrequalStatus,
): Promise<void> {
  const completedAt =
    next === "completed" || next === "abandoned" ? new Date().toISOString() : null;
  await query(
    `UPDATE prequal_sessions
        SET status = $1,
            completed_at = COALESCE($2, completed_at),
            updated_at = NOW()
      WHERE id = $3
        AND dealer_id = $4`,
    [next, completedAt, sessionId, dealerId],
  );
}

/* -------------------------------------------------------------------------- */
/* CREDIT PULL                                                                */
/* -------------------------------------------------------------------------- */

export async function recordCreditPull(
  sessionId: string,
  dealerId: string,
  result: CreditResult,
): Promise<void> {
  const encryptedRaw = result.rawResponse ? encryptPII(result.rawResponse) : null;
  await query(
    `INSERT INTO soft_credit_pulls (
       session_id, dealer_id, bureau_used,
       score_range_min, score_range_max, tier, raw_response_encrypted
     ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      sessionId,
      dealerId,
      result.bureauUsed,
      result.scoreRangeMin,
      result.scoreRangeMax,
      result.tier,
      encryptedRaw,
    ],
  );
  await transition(sessionId, dealerId, "credit_pulled");

  trackPrequal("prequal.credit_pulled", dealerId, {
    session_id: sessionId,
    bureau_used: result.bureauUsed,
    tier: result.tier,
    is_mock: result.isMock,
  });
  void auditLog(
    "prequal.credit.pulled",
    {
      session_id: sessionId,
      bureau_used: result.bureauUsed,
      tier: result.tier,
      is_mock: result.isMock,
    },
    undefined,
    dealerId,
  );
  fanoutEvent("prequal.credit_pulled", dealerId, sessionId, {
    bureau_used: result.bureauUsed,
    tier: result.tier,
  });
}

/* -------------------------------------------------------------------------- */
/* INCOME                                                                     */
/* -------------------------------------------------------------------------- */

export async function recordIncome(
  sessionId: string,
  dealerId: string,
  income: IncomeResult,
): Promise<void> {
  const encryptedToken = income.accessToken
    ? encryptPII(income.accessToken)
    : null;
  await query(
    `INSERT INTO plaid_links (
       session_id, dealer_id, plaid_item_id, access_token_encrypted,
       income_monthly_cents, income_confidence
     ) VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      sessionId,
      dealerId,
      income.itemId ?? null,
      encryptedToken,
      income.incomeMonthlyCents,
      income.confidence,
    ],
  );
  await transition(sessionId, dealerId, "income_verified");

  trackPrequal("prequal.income_verified", dealerId, {
    session_id: sessionId,
    confidence: income.confidence,
    is_mock: income.isMock,
  });
  void auditLog(
    "prequal.income.verified",
    {
      session_id: sessionId,
      confidence: income.confidence,
      is_mock: income.isMock,
    },
    undefined,
    dealerId,
  );
  fanoutEvent("prequal.income_verified", dealerId, sessionId, {
    confidence: income.confidence,
  });
}

/* -------------------------------------------------------------------------- */
/* OFFERS                                                                     */
/* -------------------------------------------------------------------------- */

export async function recordOffers(
  sessionId: string,
  dealerId: string,
  offers: PrequalOffer[],
): Promise<void> {
  // Wipe prior offers for this session so re-requests don't accumulate.
  await query(`DELETE FROM prequal_offers WHERE session_id = $1`, [sessionId]);

  for (const o of offers) {
    await query(
      `INSERT INTO prequal_offers (
         session_id, dealer_id, lender_id, lender_name,
         max_amount_cents, apr_bps, term_months, conditions, expires_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        sessionId,
        dealerId,
        o.lenderId,
        o.lenderName,
        o.maxAmountCents,
        o.aprBps,
        o.termMonths,
        JSON.stringify(o.conditions),
        o.expiresAt,
      ],
    );
  }

  await transition(sessionId, dealerId, "offers_returned");

  trackPrequal("prequal.offers_returned", dealerId, {
    session_id: sessionId,
    offer_count: offers.length,
    best_apr_bps: offers[0]?.aprBps ?? -1,
  });
  void auditLog(
    "prequal.offers.returned",
    {
      session_id: sessionId,
      offer_count: offers.length,
      lender_ids: offers.map((o) => o.lenderId),
    },
    undefined,
    dealerId,
  );
  fanoutEvent("prequal.offers_returned", dealerId, sessionId, {
    offer_count: offers.length,
  });
}

export async function getOffers(
  sessionId: string,
): Promise<PrequalOffer[]> {
  const result = await query<{
    lender_id: string;
    lender_name: string;
    max_amount_cents: string; // bigint -> string from pg
    apr_bps: number;
    term_months: number;
    conditions: Record<string, string | number | boolean>;
    expires_at: string;
  }>(
    `SELECT lender_id, lender_name, max_amount_cents, apr_bps,
            term_months, conditions, expires_at
       FROM prequal_offers
      WHERE session_id = $1
      ORDER BY apr_bps ASC`,
    [sessionId],
  );

  return result.rows.map((r) => {
    const maxAmount = Number(r.max_amount_cents);
    return {
      lenderId: r.lender_id,
      lenderName: r.lender_name,
      maxAmountCents: maxAmount,
      aprBps: r.apr_bps,
      termMonths: r.term_months,
      conditions: r.conditions,
      expiresAt: r.expires_at,
      // recompute payment for display
      estimatedMonthlyPaymentCents: estimatePaymentCents(
        maxAmount,
        r.apr_bps,
        r.term_months,
      ),
    };
  });
}

function estimatePaymentCents(
  principalCents: number,
  aprBps: number,
  termMonths: number,
): number {
  const monthlyRate = aprBps / 10_000 / 12;
  if (monthlyRate === 0) return Math.ceil(principalCents / termMonths);
  const factor = Math.pow(1 + monthlyRate, -termMonths);
  return Math.ceil((principalCents * monthlyRate) / (1 - factor));
}

/* -------------------------------------------------------------------------- */
/* TERMINAL STATES                                                            */
/* -------------------------------------------------------------------------- */

export async function markCompleted(
  sessionId: string,
  dealerId: string,
): Promise<void> {
  await transition(sessionId, dealerId, "completed");
  trackPrequal("prequal.completed", dealerId, { session_id: sessionId });
  void auditLog(
    "prequal.session.completed",
    { session_id: sessionId },
    undefined,
    dealerId,
  );
  fanoutEvent("prequal.completed", dealerId, sessionId, {});
}

export async function markAbandoned(
  sessionId: string,
  dealerId: string,
  reason?: string,
): Promise<void> {
  await transition(sessionId, dealerId, "abandoned");
  trackPrequal("prequal.abandoned", dealerId, {
    session_id: sessionId,
    reason: reason ?? "unspecified",
  });
  void auditLog(
    "prequal.session.abandoned",
    { session_id: sessionId, reason: reason ?? "unspecified" },
    undefined,
    dealerId,
  );
  fanoutEvent("prequal.abandoned", dealerId, sessionId, {
    reason: reason ?? "unspecified",
  });
}
