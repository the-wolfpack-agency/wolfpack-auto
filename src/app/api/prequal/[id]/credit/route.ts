/**
 * POST /api/prequal/[id]/credit  (PUBLIC, rate-limited, session-id auth)
 *
 * Kicks off a soft credit pull for the session id and writes the result
 * to soft_credit_pulls. Returns the tier + score range to the client.
 *
 * Auth model: the session id IS the bearer for this surface. It's only
 * accepted from the URL path, never from the body. Per-session rate limit
 * prevents brute-force enumeration.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { checkRateLimit } from "@/lib/rate-limit";
import { getSession, recordCreditPull } from "@/lib/prequal/session-store";
import { getCreditBureauProvider } from "@/lib/prequal/credit-bureau";

const creditSchema = z.object({
  consent: z.literal(true, {
    errorMap: () => ({ message: "Customer consent is required for a soft pull" }),
  }),
  ssn_last_four: z
    .string()
    .regex(/^\d{4}$/)
    .optional(),
  date_of_birth: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
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
  const parsed = creditSchema.safeParse(body);
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

  const rate = await checkRateLimit(
    `prequal:credit:session:${id}`,
    3,
    3600,
  );
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "Too many requests.", retry_after: rate.resetAt },
      { status: 429 },
    );
  }
  const ipRate = await checkRateLimit(
    `prequal:credit:ip:${clientIp(request)}`,
    20,
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
    const bureau = getCreditBureauProvider();
    const result = await bureau.softPull({
      name: session.customer_name,
      email: session.customer_email,
      phone: session.customer_phone ?? undefined,
      ssnLastFour: parsed.data.ssn_last_four,
      dateOfBirth: parsed.data.date_of_birth,
    });

    await recordCreditPull(id, session.dealer_id, result);

    return NextResponse.json(
      {
        success: true,
        tier: result.tier,
        score_range_min: result.scoreRangeMin,
        score_range_max: result.scoreRangeMax,
        bureau_used: result.bureauUsed,
        is_mock: result.isMock,
      },
      { status: 200 },
    );
  } catch (err) {
    console.error("[api/prequal/credit] failed:", err);
    const message =
      err instanceof Error ? err.message : "Credit pull failed";
    return NextResponse.json(
      { error: message, code: "credit_bureau_unavailable" },
      { status: 502 },
    );
  }
}
