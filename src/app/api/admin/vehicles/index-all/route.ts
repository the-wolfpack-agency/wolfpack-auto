import { NextRequest, NextResponse } from "next/server";
import { indexAllVehicles } from "@/lib/intake/vehicle-indexer";
import { requireAuth, isAuthenticated } from "@/lib/auth-guard";
import { checkRateLimit } from "@/lib/rate-limit";

/**
 * POST /api/admin/vehicles/index-all
 *
 * Triggers a full reindex of all vehicles into Qdrant.
 * Loads from PostgreSQL if available, otherwise uses placeholder data.
 * Idempotent — safe to call multiple times.
 *
 * No auth required in demo mode.
 */
export async function POST(request: NextRequest) {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;

  if (!process.env.DATABASE_URL) {
    return NextResponse.json({
      success: true,
      message: "Shadow mode — no database configured. Reindex skipped.",
      indexed: 0,
      failed: 0,
      total: 0,
      source: "shadow",
    });
  }

  // Rate limit: 5 full reindex operations per IP per hour
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "anonymous";
  const rateCheck = await checkRateLimit(`admin:vehicles:index-all:${ip}`, 5, 3600);
  if (!rateCheck.allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded", retryAfter: rateCheck.resetAt },
      { status: 429 },
    );
  }

  try {
    const dealerId =
      process.env.DEALER_ID ?? "00000000-0000-4000-a000-000000000001";

    const result = await indexAllVehicles(dealerId);

    if (result.indexed === 0 && result.failed > 0) {
      return NextResponse.json(
        {
          success: false,
          message:
            result.source === "qdrant_unavailable"
              ? "Qdrant is not reachable. Set QDRANT_URL and ensure Qdrant is running."
              : "Failed to index vehicles. Check that Qdrant is running and accessible.",
          indexed: result.indexed,
          failed: result.failed,
          total: result.failed,
          source: result.source,
        },
        { status: 502 },
      );
    }

    return NextResponse.json({
      success: true,
      message: `Indexed ${result.indexed} vehicles into Qdrant (source: ${result.source}).`,
      indexed: result.indexed,
      failed: result.failed,
      total: result.indexed + result.failed,
      source: result.source,
    });
  } catch (err) {
    console.error("[index-all] Unexpected error:", err);
    return NextResponse.json(
      {
        success: false,
        message: "Internal error during indexing.",
        indexed: 0,
      },
      { status: 500 },
    );
  }
}
