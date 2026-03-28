import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { getVariant, trackImpression } from "@/lib/ab-testing";

/**
 * GET /api/ab/assign?test=hero-cta&visitor_id=optional-vid
 *
 * Returns the deterministic variant for this visitor and records an
 * impression. If no visitor_id is provided, one is generated and returned
 * (the client should persist it as a cookie).
 */
export async function GET(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const rl = await checkRateLimit(`ab-assign:${ip}`, 100, 3600);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
  }

  const { searchParams } = request.nextUrl;
  const testName = searchParams.get("test");

  if (!testName) {
    return NextResponse.json(
      { error: "Missing required query parameter: test" },
      { status: 400 },
    );
  }

  // Resolve visitor ID: query param > cookie > generate new
  let visitorId = searchParams.get("visitor_id");

  if (!visitorId) {
    visitorId = request.cookies.get("wolfpack_vid")?.value ?? null;
  }

  if (!visitorId) {
    visitorId = crypto.randomUUID();
  }

  // Record impression and get variant
  const variant = await trackImpression(testName, visitorId);

  const response = NextResponse.json({ variant, visitor_id: visitorId });

  // Set cookie if not already present
  if (!request.cookies.get("wolfpack_vid")) {
    response.cookies.set("wolfpack_vid", visitorId, {
      path: "/",
      maxAge: 365 * 24 * 60 * 60, // 1 year
      sameSite: "lax",
      httpOnly: false, // client JS needs to read it
    });
  }

  return response;
}
