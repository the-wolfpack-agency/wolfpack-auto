/**
 * GET /api/admin/oem
 *
 * Returns OEM network stats and recent enrollment activity.
 * Shadow mode (no DATABASE_URL): returns rich mock data immediately.
 */
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireAuth, isAuthenticated } from "@/lib/auth-guard";
import { getDealerId } from "@/lib/get-dealer-id";
import { trackSystem } from "@/lib/analytics-hooks";
import {
  getOemNetworkStats,
  getRecentEnrollments,
} from "@/db/queries/oem";

export async function GET() {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;
  const dealerId = getDealerId(authResult);

  try {
    const [stats, enrollments] = await Promise.all([
      getOemNetworkStats(),
      getRecentEnrollments(undefined, 8),
    ]);

    trackSystem("system.analytics_queried", dealerId, { module: "oem" });
    return NextResponse.json(
      { stats, enrollments },
      {
        headers: {
          "Cache-Control": "private, max-age=60",
          "X-Content-Type-Options": "nosniff",
        },
      }
    );
  } catch (err) {
    console.error("[api/admin/oem] Unexpected error:", err);
    return NextResponse.json(
      { error: "Failed to load OEM network data" },
      { status: 500 }
    );
  }
}
