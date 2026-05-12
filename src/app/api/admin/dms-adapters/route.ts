/**
 * GET /api/admin/dms-adapters
 *
 * List the DMS adapters configured for the caller's dealer (dealer-admin
 * usage) or for an arbitrary dealer when called by Wolfpack staff (cross-
 * dealer admin view).
 *
 * Dealer-admin path:
 *   - `requireAuth` + role in { owner, admin }
 *   - returns configured adapters scoped to auth.user.dealer_id
 *
 * Wolfpack-staff path:
 *   - `requireWolfpackStaff` (viewer-or-above)
 *   - dealer_id query param required; returns that dealer's adapters
 *
 * Mutations live in `./[provider]/route.ts` (POST upsert, PATCH rotate,
 * DELETE revoke). Capability changes flow through the adapter-registry
 * library so audit + analytics fire on every write.
 *
 * Emits no analytics event itself — listing is a read.
 */

import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated, requireAuth } from "@/lib/auth-guard";
import { isWolfpackStaff, requireWolfpackStaff } from "@/lib/operator-auth";
import {
  listAvailableAdapters,
  listConfiguredAdapters,
} from "@/lib/dms-adapters";

export async function GET(request: NextRequest) {
  // Decide which auth gate to use. If `dealer_id` query param is present,
  // assume cross-dealer admin → Wolfpack-staff gate. Otherwise dealer-side.
  const requestedDealerId = request.nextUrl.searchParams.get("dealer_id");

  if (requestedDealerId) {
    const staff = await requireWolfpackStaff(request, "viewer");
    if (!isWolfpackStaff(staff)) return staff;

    const adapters = await listConfiguredAdapters(requestedDealerId);
    return NextResponse.json({
      dealer_id: requestedDealerId,
      adapters,
      count: adapters.length,
      available_providers: listAvailableAdapters(),
    });
  }

  const auth = await requireAuth(request);
  if (!isAuthenticated(auth)) return auth;

  if (auth.user.role !== "owner" && auth.user.role !== "admin") {
    return NextResponse.json(
      { error: "Insufficient permissions — dealer-admin required" },
      { status: 403 },
    );
  }

  const adapters = await listConfiguredAdapters(auth.user.dealer_id);
  return NextResponse.json({
    dealer_id: auth.user.dealer_id,
    adapters,
    count: adapters.length,
    available_providers: listAvailableAdapters(),
  });
}
