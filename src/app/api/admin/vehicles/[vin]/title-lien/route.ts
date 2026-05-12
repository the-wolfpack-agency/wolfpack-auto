/**
 * GET /api/admin/vehicles/[id]/title-lien?state=XX
 *
 * Returns the title/lien lookup for a vehicle in the requested state.
 *
 *   `[id]` may be the vehicle UUID OR the VIN. The route accepts both so
 *   the inventory page (UUID) and the deal/F&I screen (VIN) can call the
 *   same endpoint.
 *
 *   `state` (query string) is a two-letter US state code. Missing/invalid
 *   collapses to 400.
 *
 * Behavior:
 *   - 401 — no session.
 *   - 400 — missing `id` or `state`, or `state` not in registered set.
 *   - 404 — vehicle not found (or wrong dealer — info-disclosure-safe).
 *   - 200 — { supported: true|false, ... }. Always includes a result.
 *     Unsupported states return 200 with `supported: false, reason: ...`.
 *
 * Wiring (per Stream E spec):
 *   - requireAuth (admin-only).
 *   - audit_log on every lookup — title data is sensitive (per CLAUDE.md).
 *   - Analytics events (title_lien.lookup_succeeded / lookup_failed /
 *     state_not_supported) on every outcome.
 *   - 24h cache (vehicle_title_lookups), see persistence.ts.
 *   - Shadow-mode 200 with empty body when DATABASE_URL is unset.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthenticated } from "@/lib/auth-guard";
import { loadVehicle } from "@/lib/recalls"; // reuses tenant-safe vehicle loader
import {
  isStateRegistered,
  loadOrFetchTitleLien,
  registeredStateCodes,
} from "@/lib/title-lien";
import { auditLog } from "@/lib/audit-log";
import { trackTitleLien } from "@/lib/analytics-hooks";

interface RouteContext {
  params: Promise<{ vin: string }>;
}

export async function GET(
  request: NextRequest,
  context: RouteContext,
): Promise<NextResponse> {
  // Shadow-mode (no DB) — return a structured 200 so the UI can render an
  // empty state instead of erroring. Matches recall + market-intel pattern.
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({
      supported: false,
      reason: "service_not_configured",
      shadow_mode: true,
      supported_states: registeredStateCodes(),
    });
  }

  const authResult = await requireAuth(request);
  if (!isAuthenticated(authResult)) return authResult;

  const { vin } = await context.params;
  if (!id || typeof id !== "string") {
    return NextResponse.json(
      { error: "Vehicle id is required" },
      { status: 400 },
    );
  }

  const stateCode =
    request.nextUrl.searchParams.get("state")?.toUpperCase().trim() ?? "";
  if (!stateCode || stateCode.length !== 2) {
    return NextResponse.json(
      { error: "Two-letter state code is required (?state=XX)" },
      { status: 400 },
    );
  }

  const dealerId = authResult.user.dealer_id;
  const userId = authResult.user.id;

  try {
    const vehicle = await loadVehicle(dealerId, id);
    if (!vehicle) {
      return NextResponse.json({ error: "Vehicle not found" }, { status: 404 });
    }

    // The vehicles table doesn't always carry VIN on the lookup row — pull it
    // separately. We use the resolver from recalls/loadVehicle which already
    // returns make/model/year. For VIN we re-query if id was a UUID; if id was
    // a VIN, we already have it.
    const isUuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        id,
      );

    let vin: string;
    if (isUuid) {
      const { query } = await import("@/lib/db");
      const row = await query<{ vin: string }>(
        `SELECT vin FROM vehicles WHERE dealer_id = $1 AND id = $2 LIMIT 1`,
        [dealerId, id],
      );
      if (!row.rows[0]?.vin) {
        return NextResponse.json(
          { error: "Vehicle has no VIN on file" },
          { status: 400 },
        );
      }
      vin = row.rows[0].vin.toUpperCase();
    } else {
      vin = id.toUpperCase();
    }

    const result = await loadOrFetchTitleLien(
      dealerId,
      vehicle.id,
      vin,
      stateCode,
    );

    // Audit + analytics — never block the response.
    try {
      await auditLog(
        "vehicle.title_lien_lookup",
        {
          vin,
          state_code: stateCode,
          vehicle_id: vehicle.id,
          supported: result.supported,
          has_lien: result.has_lien ?? null,
          source: result.source,
          reason: result.reason ?? null,
        },
        userId,
        dealerId,
        request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
          undefined,
      );
    } catch {
      /* audit must not throw */
    }

    try {
      if (!isStateRegistered(stateCode) || result.reason === "state_not_supported_yet") {
        trackTitleLien("title_lien.state_not_supported", dealerId, {
          vin,
          state_code: stateCode,
          vehicle_id: vehicle.id,
        });
      } else if (result.supported) {
        trackTitleLien("title_lien.lookup_succeeded", dealerId, {
          vin,
          state_code: stateCode,
          vehicle_id: vehicle.id,
          has_lien: result.has_lien ?? false,
          source: result.source,
        });
      } else {
        trackTitleLien("title_lien.lookup_failed", dealerId, {
          vin,
          state_code: stateCode,
          vehicle_id: vehicle.id,
          reason: result.reason ?? "unknown",
          source: result.source,
        });
      }
    } catch {
      /* analytics must not throw */
    }

    return NextResponse.json({
      vehicle_id: vehicle.id,
      vin,
      state_code: stateCode,
      supported: result.supported,
      reason: result.reason,
      has_lien: result.has_lien ?? null,
      lienholder_name: result.lienholder_name ?? null,
      title_status: result.title_status ?? null,
      source: result.source,
      looked_up_at: result.looked_up_at,
      supported_states: registeredStateCodes(),
    });
  } catch (err) {
    console.error("[GET /api/admin/vehicles/[id]/title-lien] Error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
