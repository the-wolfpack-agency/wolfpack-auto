/**
 * GET /api/admin/oem/dealers
 *
 * Returns all dealers in the OEM network with program performance data.
 * Shadow mode (no DATABASE_URL): returns rich mock data immediately.
 */
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireAuth, isAuthenticated } from "@/lib/auth-guard";
import { getOemNetworkDealers } from "@/db/queries/oem";

export async function GET() {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;

  try {
    const dealers = await getOemNetworkDealers(undefined, 100);

    return NextResponse.json(
      { dealers },
      {
        headers: {
          "Cache-Control": "private, max-age=60",
          "X-Content-Type-Options": "nosniff",
        },
      }
    );
  } catch (err) {
    console.error("[api/admin/oem/dealers] Unexpected error:", err);
    return NextResponse.json(
      { error: "Failed to load OEM dealer network" },
      { status: 500 }
    );
  }
}
