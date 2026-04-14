import { NextRequest, NextResponse } from "next/server";
import { captureError } from "@/lib/error-monitor";

/**
 * POST /api/errors/report — Public endpoint for client-side error reporting.
 *
 * No auth required — client JS sends errors here automatically.
 */

export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "anon";
  const { checkRateLimit } = await import("@/lib/rate-limit");
  const rl = await checkRateLimit(`error-report:${ip}`, 100, 60);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const {
    message,
    stack,
    page_url,
    session_id,
    context,
  } = body as {
    message?: string;
    stack?: string;
    page_url?: string;
    session_id?: string;
    context?: Record<string, unknown>;
  };

  if (!message) {
    return NextResponse.json({ error: "message is required" }, { status: 400 });
  }

  const userAgent = request.headers.get("user-agent") ?? "";
  const dealerId = process.env.DEALER_ID ?? "00000000-0000-4000-a000-000000000001";

  const error = captureError(
    message,
    (stack as string) ?? null,
    (page_url as string) ?? request.nextUrl.pathname,
    userAgent,
    (session_id as string) ?? null,
    dealerId,
    context as Record<string, string | string[] | number | null> | undefined,
  );

  // Persist if DB available
  if (process.env.DATABASE_URL) {
    const { query } = await import("@/lib/db");
    await query(
      `INSERT INTO client_errors (id, message, stack, fingerprint, page_url, user_agent, session_id, dealer_id, captured_at, context)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        error.id,
        error.message,
        error.stack,
        error.fingerprint,
        error.page_url,
        error.user_agent,
        error.session_id,
        error.dealer_id,
        error.captured_at,
        JSON.stringify(error.context),
      ],
    );
  }

  return NextResponse.json(
    { captured: true, error_id: error.id, fingerprint: error.fingerprint },
    { status: 201 },
  );
}
