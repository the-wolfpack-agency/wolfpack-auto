import { NextRequest, NextResponse } from "next/server";
import { normalizeVehicles } from "@/lib/dms/normalizer";
import { DMSProvider } from "@/lib/dms/types";
import type { DMSVehicleRecord } from "@/lib/dms/types";
import { processBulkIntake, type IntakeResult } from "@/lib/intake/pipeline";
import { requireAuth, isAuthenticated } from "@/lib/auth-guard";
import { auditLog } from "@/lib/audit-log";
import { trackSystem } from "@/lib/analytics-hooks";

/**
 * POST /api/admin/intake
 *
 * Bulk vehicle intake endpoint.
 *
 * Accepts raw DMS records, normalizes them via the DMS normalizer,
 * then runs the full intake pipeline (DB, Qdrant, Neo4j, photos,
 * listing generation).
 *
 * Body: {
 *   vehicles: DMSVehicleRecord[],
 *   dealer_id: string,
 *   provider?: "CDK" | "REYNOLDS" | "DEALERTRACK" | "TEKION" | "GENERIC_CSV" | "GENERIC_XML"
 * }
 */
export async function POST(request: NextRequest) {
  // --- Authentication ---
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;

  if (!process.env.DATABASE_URL) {
    return NextResponse.json({
      success: true,
      summary: { total_received: 0, total_normalized: 0, created: 0, updated: 0, skipped: 0, errored: 0 },
      message: "Shadow mode — no database configured. Intake not processed.",
    });
  }

  const sessionDealerId = authResult.user.dealer_id;

  try {
    const body = await request.json();

    // --- Validate request ---

    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { error: "Request body must be a JSON object" },
        { status: 400 },
      );
    }

    const { vehicles, provider } = body as {
      vehicles?: DMSVehicleRecord[];
      provider?: string;
    };

    // Use dealer_id from session instead of request body
    const dealer_id = sessionDealerId;

    if (!Array.isArray(vehicles) || vehicles.length === 0) {
      return NextResponse.json(
        { error: "vehicles must be a non-empty array" },
        { status: 400 },
      );
    }

    if (vehicles.length > 500) {
      return NextResponse.json(
        { error: "Maximum 500 vehicles per request. Split larger feeds into multiple calls." },
        { status: 400 },
      );
    }

    // Resolve provider (default to GENERIC_CSV)
    const dmsProvider: DMSProvider =
      provider && Object.values(DMSProvider).includes(provider as DMSProvider)
        ? (provider as DMSProvider)
        : DMSProvider.GENERIC_CSV;

    // --- Normalize ---

    const { results: normResults, totalErrors, totalWarnings } =
      normalizeVehicles(vehicles, dmsProvider);

    // Collect successfully normalized vehicles
    const normalizedVehicles = normResults
      .filter((r) => r.vehicle !== null)
      .map((r) => r.vehicle!);

    const normalizationErrors = normResults
      .filter((r) => r.errors.length > 0)
      .map((r, i) => ({
        index: i,
        vin: r.vehicle?.vin ?? null,
        errors: r.errors,
      }));

    if (normalizedVehicles.length === 0) {
      return NextResponse.json(
        {
          error: "No vehicles passed normalization",
          normalization_errors: normalizationErrors,
          total_received: vehicles.length,
          total_normalized: 0,
        },
        { status: 422 },
      );
    }

    // --- Run intake pipeline ---

    const intakeResults = await processBulkIntake(normalizedVehicles, dealer_id.trim());

    // --- Build summary ---

    const summary = buildSummary(intakeResults);

    // Audit log: record bulk intake (fire-and-forget)
    void auditLog("intake.bulk", {
      count: normalizedVehicles.length,
      dealer_id: dealer_id.trim(),
    }, undefined, dealer_id.trim()).catch(() => {});

    try { trackSystem("system.intake_processed", authResult?.user?.dealer_id ?? "system", { action: "bulk_intake", count: normalizedVehicles.length }); } catch {}

    return NextResponse.json({
      success: true,
      summary: {
        total_received: vehicles.length,
        total_normalized: normalizedVehicles.length,
        normalization_errors: totalErrors,
        normalization_warnings: totalWarnings,
        ...summary,
      },
      results: intakeResults,
      normalization_errors: normalizationErrors.length > 0 ? normalizationErrors : undefined,
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: "Internal server error during intake processing",
        message: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    );
  }
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function buildSummary(results: IntakeResult[]) {
  let created = 0;
  let updated = 0;
  let skipped = 0;
  let errored = 0;
  let descriptions_generated = 0;
  let total_photos_processed = 0;
  let indexed_in_qdrant = 0;
  let indexed_in_neo4j = 0;

  for (const r of results) {
    switch (r.status) {
      case "created":
        created++;
        break;
      case "updated":
        updated++;
        break;
      case "skipped":
        skipped++;
        break;
      case "error":
        errored++;
        break;
    }
    if (r.description_generated) descriptions_generated++;
    total_photos_processed += r.photos_processed;
    if (r.indexed_in_qdrant) indexed_in_qdrant++;
    if (r.indexed_in_neo4j) indexed_in_neo4j++;
  }

  return {
    created,
    updated,
    skipped,
    errored,
    descriptions_generated,
    total_photos_processed,
    indexed_in_qdrant,
    indexed_in_neo4j,
  };
}
