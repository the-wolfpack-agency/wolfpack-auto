/**
 * GET /api/admin/oem/programs
 *
 * Returns all OEM programs with enrollment counts and completion rates.
 * Shadow mode (no DATABASE_URL): returns rich mock data immediately.
 */
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireAuth, isAuthenticated } from "@/lib/auth-guard";
import { getOemPrograms } from "@/db/queries/oem";
import { trackSystem } from "@/lib/analytics-hooks";

export async function GET() {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;

  try {
    const programs = await getOemPrograms();

    trackSystem("system.analytics_queried", authResult.user.dealer_id ?? "", { module: "oem_programs", count: programs.length });

    return NextResponse.json(
      { programs },
      {
        headers: {
          "Cache-Control": "private, max-age=60",
          "X-Content-Type-Options": "nosniff",
        },
      }
    );
  } catch (err) {
    console.error("[api/admin/oem/programs] Unexpected error:", err);
    return NextResponse.json(
      { error: "Failed to load OEM programs" },
      { status: 500 }
    );
  }
}
