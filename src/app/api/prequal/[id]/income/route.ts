/**
 * POST /api/prequal/[id]/income  (PUBLIC, rate-limited, session-id auth)
 *
 * Accepts customer-self-reported income for v0.1. Plaid link wiring is
 * stubbed -- when ENV INCOME_VERIFICATION_PROVIDER=plaid is set the call
 * will throw IncomeProviderNotConfiguredError until the SDK is wired.
 *
 * Self-reported income gets confidence=`self_reported`, never lying to
 * the downstream lender engine about verification level.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { checkRateLimit } from "@/lib/rate-limit";
import { getSession, recordIncome } from "@/lib/prequal/session-store";
import { normalizeSelfReportedIncome } from "@/lib/prequal/plaid-client";

const incomeSchema = z.object({
  amount_cents: z.number().int().positive().max(100_000_000),
  cadence: z.enum(["monthly", "annual"]),
});

function clientIp(request: NextRequest): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "unknown"
  );
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: "Invalid session id" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = incomeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Validation failed",
        details: parsed.error.issues.map((i) => ({
          field: i.path.join("."),
          message: i.message,
        })),
      },
      { status: 400 },
    );
  }

  const rate = await checkRateLimit(`prequal:income:session:${id}`, 5, 3600);
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "Too many requests.", retry_after: rate.resetAt },
      { status: 429 },
    );
  }
  const ipRate = await checkRateLimit(
    `prequal:income:ip:${clientIp(request)}`,
    25,
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

  try {
    const result = normalizeSelfReportedIncome({
      amountCents: parsed.data.amount_cents,
      cadence: parsed.data.cadence,
    });
    await recordIncome(id, session.dealer_id, result);

    return NextResponse.json(
      {
        success: true,
        income_monthly_cents: result.incomeMonthlyCents,
        confidence: result.confidence,
      },
      { status: 200 },
    );
  } catch (err) {
    console.error("[api/prequal/income] failed:", err);
    const message =
      err instanceof Error ? err.message : "Income verification failed";
    return NextResponse.json(
      { error: message, code: "income_provider_unavailable" },
      { status: 502 },
    );
  }
}
