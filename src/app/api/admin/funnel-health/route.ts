import { NextResponse } from "next/server";
import { requireAuth, isAuthenticated } from "@/lib/auth-guard";
import { getFunnelHealthMetrics } from "@/lib/funnel-health";

const DEALER_ID = process.env.DEALER_ID ?? "default";

/**
 * GET /api/admin/funnel-health
 *
 * Returns FunnelHealthMetrics for the current dealer.
 * Cached for 5 minutes — lead funnel data does not require real-time precision.
 */
export async function GET() {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;

  try {
    const metrics = await getFunnelHealthMetrics(DEALER_ID);

    return NextResponse.json(metrics, {
      headers: {
        "Cache-Control": "private, max-age=300",
        "X-Content-Type-Options": "nosniff",
        "X-Frame-Options": "DENY",
        "Referrer-Policy": "strict-origin-when-cross-origin",
      },
    });
  } catch (err) {
    console.error("[api/admin/funnel-health] Unexpected error:", err);
    return NextResponse.json(
      { error: "Failed to load funnel health metrics" },
      { status: 500 },
    );
  }
}
