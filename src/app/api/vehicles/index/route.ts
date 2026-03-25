import { NextResponse } from "next/server";
import { placeholderVehicles } from "@/lib/placeholder-data";
import { indexAllVehiclesToQdrant } from "@/lib/vehicle-search";

/**
 * POST /api/vehicles/index
 *
 * Indexes all vehicles into Qdrant for vector search.
 * Called manually or by a DMS feed processor after sync.
 * Idempotent — safe to call multiple times.
 */
export async function POST() {
  try {
    if (!process.env.QDRANT_URL) {
      return NextResponse.json(
        {
          success: false,
          message:
            "QDRANT_URL is not configured. Set it in your environment to enable vector search. " +
            "The chat system will use keyword search on placeholder data in the meantime.",
          indexed: 0,
          total: placeholderVehicles.length,
        },
        { status: 400 },
      );
    }

    const result = await indexAllVehiclesToQdrant(placeholderVehicles);

    if (result.indexed === 0 && result.failed > 0) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Failed to index vehicles. Check that Qdrant is running and accessible.",
          indexed: result.indexed,
          failed: result.failed,
          total: placeholderVehicles.length,
        },
        { status: 502 },
      );
    }

    return NextResponse.json({
      success: true,
      message: `Successfully indexed ${result.indexed} vehicles into Qdrant.`,
      indexed: result.indexed,
      failed: result.failed,
      total: placeholderVehicles.length,
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
