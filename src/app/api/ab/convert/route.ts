import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { trackConversion } from "@/lib/ab-testing";

/**
 * POST /api/ab/convert
 *
 * Body: { test: string, visitor_id: string }
 *
 * Records a conversion for the visitor's assigned variant.
 */
export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const rl = await checkRateLimit(`ab-convert:${ip}`, 50, 3600);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const { test, visitor_id } = body as Record<string, unknown>;

  if (typeof test !== "string" || !test) {
    return NextResponse.json(
      { error: "Missing required field: test" },
      { status: 400 },
    );
  }

  if (typeof visitor_id !== "string" || !visitor_id) {
    return NextResponse.json(
      { error: "Missing required field: visitor_id" },
      { status: 400 },
    );
  }

  await trackConversion(test, visitor_id);

  return NextResponse.json({ success: true }, { status: 200 });
}
