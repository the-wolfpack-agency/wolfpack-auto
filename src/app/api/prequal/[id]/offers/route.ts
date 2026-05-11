/**
 * GET  /api/prequal/[id]/offers  (PUBLIC, rate-limited, session-id auth)
 *
 * Generates lender quotes from the soft credit pull + income on file,
 * persists them to prequal_offers, and returns them.
 *
 * If credit + income are missing for the session, returns 409 with a
 * clear `missing_steps` array so the wizard can guide the customer
 * back to the correct step.
 */

import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { checkRateLimit } from "@/lib/rate-limit";
import { getSession, recordOffers, getOffers } from "@/lib/prequal/session-store";
import { generateQuotes } from "@/lib/prequal/lender-quote-engine";
import type {
  CreditResult,
  IncomeResult,
  CreditTier,
  CreditBureau,
  IncomeConfidence,
  VehicleInterest,
} from "@/lib/prequal/types";

/* -------------------------------------------------------------------------- */
/* Vehicle interest -> estimated price                                        */
/* -------------------------------------------------------------------------- */

/**
 * Best-effort price estimator from free-form text. Real implementation in a
 * follow-up integrates with inventory + vehicle-search. For v0.1 of the flow
 * we use a coarse heuristic that lands in a believable range for the segment.
 */
function estimatePriceFromText(text: string): number {
  const t = text.toLowerCase();
  if (/luxury|porsche|cayenne|maserati|range rover/.test(t)) return 11_500_000;
  if (/truck|tundra|f-?150|f-?250|silverado|ram|tacoma/.test(t)) return 5_500_000;
  if (/suv|tahoe|expedition|highlander|pilot|x5|q7/.test(t)) return 6_000_000;
  if (/electric|tesla|ev|mach-?e|lightning/.test(t)) return 6_500_000;
  if (/midsize|camry|accord|altima|malibu/.test(t)) return 3_200_000;
  if (/compact|civic|corolla|sentra|elantra/.test(t)) return 2_400_000;
  // Default midpoint -- ~$35k.
  return 3_500_000;
}

function clientIp(request: NextRequest): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "unknown"
  );
}

/* -------------------------------------------------------------------------- */
/* Handler                                                                    */
/* -------------------------------------------------------------------------- */

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: "Invalid session id" }, { status: 400 });
  }

  const rate = await checkRateLimit(`prequal:offers:session:${id}`, 10, 3600);
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "Too many requests.", retry_after: rate.resetAt },
      { status: 429 },
    );
  }
  const ipRate = await checkRateLimit(
    `prequal:offers:ip:${clientIp(request)}`,
    60,
    3600,
  );
  if (!ipRate.allowed) {
    return NextResponse.json(
      { error: "Too many requests.", retry_after: ipRate.resetAt },
      { status: 429 },
    );
  }

  if (!process.env.DATABASE_URL) {
    return NextResponse.json(
      { error: "Service temporarily unavailable" },
      { status: 503 },
    );
  }

  const session = await getSession(id);
  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  // Fetch the latest credit + income for this session
  const creditQ = await query<{
    bureau_used: CreditBureau;
    score_range_min: number;
    score_range_max: number;
    tier: CreditTier;
  }>(
    `SELECT bureau_used, score_range_min, score_range_max, tier
       FROM soft_credit_pulls
      WHERE session_id = $1
      ORDER BY credit_pulled_at DESC
      LIMIT 1`,
    [id],
  );
  const incomeQ = await query<{
    income_monthly_cents: string;
    income_confidence: IncomeConfidence;
  }>(
    `SELECT income_monthly_cents, income_confidence
       FROM plaid_links
      WHERE session_id = $1
      ORDER BY linked_at DESC
      LIMIT 1`,
    [id],
  );

  const missing: string[] = [];
  if (creditQ.rows.length === 0) missing.push("credit");
  if (incomeQ.rows.length === 0) missing.push("income");
  if (missing.length > 0) {
    return NextResponse.json(
      {
        error: "Pre-qualification not ready",
        missing_steps: missing,
      },
      { status: 409 },
    );
  }

  const credit: CreditResult = {
    bureauUsed: creditQ.rows[0].bureau_used,
    scoreRangeMin: creditQ.rows[0].score_range_min,
    scoreRangeMax: creditQ.rows[0].score_range_max,
    tier: creditQ.rows[0].tier,
    rawResponse: "",
    isMock: creditQ.rows[0].bureau_used === "mock",
  };
  const income: IncomeResult = {
    incomeMonthlyCents: Number(incomeQ.rows[0].income_monthly_cents),
    confidence: incomeQ.rows[0].income_confidence,
    isMock:
      incomeQ.rows[0].income_confidence === "mock" ||
      incomeQ.rows[0].income_confidence === "self_reported",
  };
  const vehicle: VehicleInterest = {
    text: session.vehicle_interest_text,
    estimatedPriceCents: estimatePriceFromText(session.vehicle_interest_text),
  };

  try {
    const quotes = generateQuotes({ credit, income, vehicle });
    await recordOffers(id, session.dealer_id, quotes);

    // Re-read so we serve canonical persisted form (also exercises the read path).
    const persisted = await getOffers(id);

    return NextResponse.json(
      {
        success: true,
        session_id: id,
        offer_count: persisted.length,
        offers: persisted.map((o) => ({
          lender_id: o.lenderId,
          lender_name: o.lenderName,
          max_amount_cents: o.maxAmountCents,
          apr_bps: o.aprBps,
          term_months: o.termMonths,
          conditions: o.conditions,
          expires_at: o.expiresAt,
          estimated_monthly_payment_cents: o.estimatedMonthlyPaymentCents,
        })),
        vehicle: {
          interest_text: session.vehicle_interest_text,
          estimated_price_cents: vehicle.estimatedPriceCents,
        },
      },
      { status: 200 },
    );
  } catch (err) {
    console.error("[api/prequal/offers] failed:", err);
    return NextResponse.json(
      { error: "Failed to generate offers" },
      { status: 500 },
    );
  }
}
