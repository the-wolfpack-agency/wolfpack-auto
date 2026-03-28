import { NextResponse } from "next/server";
import { requireAuth, isAuthenticated } from "@/lib/auth-guard";
import { getFunnelHealthMetrics } from "@/lib/funnel-health";
import { getDealerId } from "@/lib/get-dealer-id";

/**
 * GET /api/admin/funnel-health
 *
 * Returns FunnelHealthMetrics for the current dealer.
 * Cached for 5 minutes — lead funnel data does not require real-time precision.
 */
export async function GET() {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;
  const dealerId = getDealerId(authResult);

  if (!process.env.DATABASE_URL) {
    return NextResponse.json({
      total_leads: 195,
      new_leads: 47,
      contacted: 38,
      qualified: 22,
      appointment_set: 14,
      sold: 8,
      lost: 66,
      conversion_rate: 4.7,
      avg_response_time_hours: 2.3,
      stale_leads: 12,
    });
  }

  try {
    const metrics = await getFunnelHealthMetrics(dealerId);

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
