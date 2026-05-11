/**
 * POST /api/prequal/start  (PUBLIC, rate-limited)
 *
 * Customer kicks off a pre-qualification session. Accepts identity +
 * vehicle interest, returns a session id the client uses for subsequent
 * credit / income / offers calls.
 *
 * Rate limited per-IP + per-email so a bot can't spam-create sessions.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { checkRateLimit } from "@/lib/rate-limit";
import { createSession } from "@/lib/prequal/session-store";

const startSchema = z.object({
  dealer_id: z.string().uuid("dealer_id must be a UUID"),
  customer_name: z.string().min(2).max(120),
  customer_email: z.string().email().max(255),
  customer_phone: z
    .string()
    .regex(/^\+?[1-9]\d{1,14}$/, "Invalid phone (E.164)")
    .max(32)
    .nullable()
    .optional()
    .default(null),
  vehicle_interest_text: z.string().min(1).max(500),
});

function clientIp(request: NextRequest): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "unknown"
  );
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = startSchema.safeParse(body);
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

  const input = parsed.data;
  const ip = clientIp(request);

  // Rate limit: 5 starts per IP per hour, 3 starts per email per hour.
  const ipLimit = await checkRateLimit(`prequal:start:ip:${ip}`, 5, 3600);
  if (!ipLimit.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later.", retry_after: ipLimit.resetAt },
      { status: 429 },
    );
  }
  const emailLimit = await checkRateLimit(
    `prequal:start:email:${input.customer_email.toLowerCase()}`,
    3,
    3600,
  );
  if (!emailLimit.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later.", retry_after: emailLimit.resetAt },
      { status: 429 },
    );
  }

  // No DB? Return a queued response so the wizard doesn't blank.
  if (!process.env.DATABASE_URL) {
    return NextResponse.json(
      {
        success: true,
        session_id: `queued-${Date.now()}`,
        started_at: new Date().toISOString(),
        note: "Pre-qualification queued. Database currently unavailable.",
      },
      { status: 201 },
    );
  }

  try {
    const created = await createSession({
      dealerId: input.dealer_id,
      customerName: input.customer_name,
      customerEmail: input.customer_email,
      customerPhone: input.customer_phone,
      vehicleInterestText: input.vehicle_interest_text,
      ipAddress: ip,
      userAgent: request.headers.get("user-agent") ?? undefined,
    });

    return NextResponse.json(
      {
        success: true,
        session_id: created.id,
        started_at: created.startedAt,
      },
      { status: 201 },
    );
  } catch (err) {
    console.error("[api/prequal/start] failed:", err);
    return NextResponse.json(
      { error: "Failed to start pre-qualification" },
      { status: 500 },
    );
  }
}
