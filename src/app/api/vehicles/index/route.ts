import { NextResponse } from "next/server";
import { indexAllVehicles } from "@/lib/intake/vehicle-indexer";
import { requireAuth } from "@/lib/auth-guard";

/**
 * POST /api/vehicles/index
 *
 * Indexes all vehicles into Qdrant for vector search.
 * Called manually or by a DMS feed processor after sync.
 * Idempotent — safe to call multiple times.
 *
 * Uses the vehicle-indexer utility which loads from PostgreSQL
 * when DATABASE_URL is set, falling back to placeholder data.
 */
export async function POST() {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  try {
    if (!process.env.QDRANT_URL) {
      return NextResponse.json(
        {
          success: false,
          message:
            "QDRANT_URL is not configured. Set it in your environment to enable vector search. " +
            "The chat system will use keyword search on placeholder data in the meantime.",
          indexed: 0,
          total: 0,
        },
        { status: 400 },
      );
    }

    const dealerId =
      process.env.DEALER_ID ?? "00000000-0000-4000-a000-000000000001";

    const result = await indexAllVehicles(dealerId);

    if (result.indexed === 0 && result.failed > 0) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Failed to index vehicles. Check that Qdrant is running and accessible.",
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
      message: `Successfully indexed ${result.indexed} vehicles into Qdrant (source: ${result.source}).`,
      indexed: result.indexed,
      failed: result.failed,
      total: result.indexed + result.failed,
      source: result.source,
    });
  } catch {
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
