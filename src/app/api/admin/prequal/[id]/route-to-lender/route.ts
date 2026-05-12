/**
 * POST /api/admin/prequal/[id]/route-to-lender
 *
 * Takes an existing prequal (migration 067 prequal_sessions) and routes the
 * customer's packet to the dealer's actual lender stack (migration 070
 * dealer_lender_routes). One row per dispatch is written to
 * prequal_lender_dispatches with status + failure_reason.
 *
 * Body (optional):
 *   {
 *     onlyRouteIds?: string[];          // restrict to specific lender routes
 *     dealerName?: string;              // override for the packet header
 *     dealerLocation?: string;
 *     stockNumber?: string;
 *     vin?: string;
 *     estimatedPriceCents?: number;
 *     ssnLastFour?: string;
 *     dateOfBirth?: string;
 *     employment?: { employer: string; monthsAtEmployer?: number; occupation?: string };
 *     residence?: { addressLine?: string; city?: string; state?: string; zip?: string;
 *                    monthsAtResidence?: number; rentOrOwn?: "rent"|"own"|"other" };
 *     priorBankruptcies?: boolean;
 *     ofacClear?: boolean;              // default true (no hit on file)
 *   }
 *
 * Pulls customer name + vehicle interest from prequal_sessions, credit summary
 * from soft_credit_pulls, and income from plaid_links. The bureau remains
 * mocked per Stream B scope -- we don't re-pull credit here.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthenticated } from "@/lib/auth-guard";
import { getDealerId } from "@/lib/get-dealer-id";
import { auditLog } from "@/lib/audit-log";
import { trackPrequal } from "@/lib/analytics-hooks";
import { routePrequalToLenders } from "@/lib/prequal/lender-routing";
import type { LenderPacketInput } from "@/lib/prequal/lender-packet-pdf";
import { getSession } from "@/lib/prequal/session-store";

interface Ctx {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, ctx: Ctx) {
  const authResult = await requireAuth(request);
  if (!isAuthenticated(authResult)) return authResult;
  const dealerId = getDealerId(authResult);
  const { id: prequalId } = await ctx.params;

  if (!prequalId) {
    return NextResponse.json({ error: "Missing prequal id" }, { status: 400 });
  }

  let body: Record<string, unknown> = {};
  try {
    const raw = await request.text();
    if (raw.trim().length > 0) body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Shadow-mode path: respond with a representative payload so the wizard
  // and Playwright E2E work without a DB. Same posture as other admin routes.
  if (!process.env.DATABASE_URL) {
    const stub: LenderPacketInput = {
      prequalId,
      dealerName: "Wolfpack Demo Motors",
      customerName: "Demo Customer",
      vehicleInterestText: "Demo vehicle",
      income: { monthlyCents: 600_000, confidence: "self_reported", isMock: true },
      credit: {
        bureauUsed: "mock",
        scoreRangeMin: 660,
        scoreRangeMax: 700,
        tier: "prime",
        isMock: true,
      },
      ofacClear: true,
    };
    return NextResponse.json({
      prequal_id: prequalId,
      shadow_mode: true,
      dispatches: [],
      packet_subject: `Pre-qualified buyer: ${stub.customerName} -- Prime tier -- Demo vehicle`,
    });
  }

  // 1. Load prequal session + latest credit + latest income.
  let prequalSession: Awaited<ReturnType<typeof getSession>>;
  try {
    prequalSession = await getSession(prequalId);
  } catch (err) {
    console.error("[route-to-lender] getSession error:", err);
    return NextResponse.json({ error: "Failed to load prequal session" }, { status: 500 });
  }
  if (!prequalSession) {
    return NextResponse.json({ error: "Prequal not found" }, { status: 404 });
  }
  if (prequalSession.dealer_id !== dealerId) {
    // Cross-tenant access attempt -- 404 not 403 to avoid leaking existence.
    return NextResponse.json({ error: "Prequal not found" }, { status: 404 });
  }

  let credit: {
    bureauUsed: "mock" | "experian" | "equifax" | "transunion";
    scoreRangeMin: number;
    scoreRangeMax: number;
    tier:
      | "super_prime"
      | "prime"
      | "near_prime"
      | "subprime"
      | "deep_subprime";
    isMock: boolean;
  } | null = null;
  let income: {
    monthlyCents: number;
    confidence:
      | "self_reported"
      | "mock"
      | "plaid_low"
      | "plaid_medium"
      | "plaid_high";
    isMock: boolean;
  } | null = null;

  try {
    const { query } = await import("@/lib/db");
    const cr = await query<{
      bureau_used: "mock" | "experian" | "equifax" | "transunion";
      score_range_min: number;
      score_range_max: number;
      tier:
        | "super_prime"
        | "prime"
        | "near_prime"
        | "subprime"
        | "deep_subprime";
    }>(
      `SELECT bureau_used, score_range_min, score_range_max, tier
         FROM soft_credit_pulls
        WHERE session_id = $1 AND dealer_id = $2
        ORDER BY credit_pulled_at DESC
        LIMIT 1`,
      [prequalId, dealerId],
    );
    if (cr.rows.length > 0) {
      const c = cr.rows[0];
      credit = {
        bureauUsed: c.bureau_used,
        scoreRangeMin: c.score_range_min,
        scoreRangeMax: c.score_range_max,
        tier: c.tier,
        isMock: c.bureau_used === "mock",
      };
    }

    const ir = await query<{
      income_monthly_cents: string;
      income_confidence:
        | "self_reported"
        | "mock"
        | "plaid_low"
        | "plaid_medium"
        | "plaid_high";
    }>(
      `SELECT income_monthly_cents, income_confidence
         FROM plaid_links
        WHERE session_id = $1 AND dealer_id = $2
        ORDER BY linked_at DESC
        LIMIT 1`,
      [prequalId, dealerId],
    );
    if (ir.rows.length > 0) {
      const i = ir.rows[0];
      income = {
        monthlyCents: Number(i.income_monthly_cents),
        confidence: i.income_confidence,
        isMock: i.income_confidence === "mock",
      };
    }
  } catch (err) {
    console.error("[route-to-lender] credit/income lookup failed:", err);
  }

  if (!credit) {
    return NextResponse.json(
      { error: "No soft credit pull on file for this prequal -- pull credit first." },
      { status: 400 },
    );
  }
  if (!income) {
    return NextResponse.json(
      { error: "No income on file for this prequal -- verify income first." },
      { status: 400 },
    );
  }

  // 2. Stitch the packet input.
  const packetInput: LenderPacketInput = {
    prequalId,
    dealerName: typeof body.dealerName === "string"
      ? (body.dealerName as string)
      : "Your dealership",
    dealerLocation:
      typeof body.dealerLocation === "string" ? (body.dealerLocation as string) : undefined,
    customerName: prequalSession.customer_name,
    customerEmail: prequalSession.customer_email,
    customerPhone: prequalSession.customer_phone ?? undefined,
    ssnLastFour: typeof body.ssnLastFour === "string" ? (body.ssnLastFour as string) : undefined,
    dateOfBirth: typeof body.dateOfBirth === "string" ? (body.dateOfBirth as string) : undefined,
    vehicleInterestText: prequalSession.vehicle_interest_text,
    stockNumber: typeof body.stockNumber === "string" ? (body.stockNumber as string) : undefined,
    vin: typeof body.vin === "string" ? (body.vin as string) : undefined,
    estimatedPriceCents:
      typeof body.estimatedPriceCents === "number"
        ? (body.estimatedPriceCents as number)
        : undefined,
    income,
    credit,
    employment:
      body.employment && typeof body.employment === "object"
        ? (body.employment as LenderPacketInput["employment"])
        : undefined,
    residence:
      body.residence && typeof body.residence === "object"
        ? (body.residence as LenderPacketInput["residence"])
        : undefined,
    priorBankruptcies:
      typeof body.priorBankruptcies === "boolean"
        ? (body.priorBankruptcies as boolean)
        : false,
    ofacClear: typeof body.ofacClear === "boolean" ? (body.ofacClear as boolean) : true,
  };

  const onlyRouteIds =
    Array.isArray(body.onlyRouteIds) &&
    body.onlyRouteIds.every((v) => typeof v === "string")
      ? (body.onlyRouteIds as string[])
      : undefined;

  // 3. Route.
  let result: Awaited<ReturnType<typeof routePrequalToLenders>>;
  try {
    result = await routePrequalToLenders({
      dealerId,
      prequalId,
      packetInput,
      onlyRouteIds,
    });
  } catch (err) {
    try {
      trackPrequal("prequal.lender_route_failed", dealerId, {
        prequal_id: prequalId,
        reason: "exception",
        message: (err as Error).message,
      });
    } catch {
      /* ignore */
    }
    console.error("[route-to-lender] routePrequalToLenders error:", err);
    return NextResponse.json(
      { error: "Failed to route prequal to lenders" },
      { status: 500 },
    );
  }

  void auditLog(
    "prequal.route_to_lender",
    {
      prequal_id: prequalId,
      dispatch_count: result.dispatches.length,
      lender_route_ids: result.dispatches.map((d) => d.lenderRouteId),
    },
    authResult.user.id,
    dealerId,
  );

  return NextResponse.json(
    {
      prequal_id: result.prequalId,
      dispatches: result.dispatches,
      packet_subject: result.packetSubject,
      packet_text_fallback: result.packetTextFallback ?? null,
    },
    { status: 200 },
  );
}
