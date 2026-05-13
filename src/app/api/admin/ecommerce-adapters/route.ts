/**
 * GET /api/admin/ecommerce-adapters
 *
 * List the e-commerce adapters configured for the caller's tenant
 * (tenant-admin usage) or for an arbitrary tenant when called by Wolfpack
 * staff (cross-tenant admin view).
 *
 * Year-2 retail-vertical foundation per
 * `docs/wolfpack-platform-multivertical-2026-05-12.md`. Mirrors
 * `src/app/api/admin/dms-adapters/route.ts` — same shape, e-commerce
 * adapters instead of DMS adapters, tenant-scoped instead of dealer-scoped.
 *
 * Tenant-admin path:
 *   - `requireAuth` + role in { owner, admin }
 *   - returns configured adapters scoped to auth.user.dealer_id (vertical-
 *     agnostic tenant identity — retail tenants reuse the same column).
 *
 * Wolfpack-staff path:
 *   - `requireWolfpackStaff` (viewer-or-above)
 *   - tenant_id query param required; returns that tenant's adapters
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
  listAvailableEcommerceAdapters,
  listConfiguredEcommerceAdapters,
} from "@/lib/ecommerce-adapters";

export async function GET(request: NextRequest) {
  // Authenticate FIRST, unconditionally — the user-controlled tenant_id
  // query param only decides which data is returned, never which auth
  // check runs. Defends against CodeQL js/user-controlled-bypass.
  const auth = await requireAuth(request);
  if (!isAuthenticated(auth)) return auth;

  const requestedTenantId = request.nextUrl.searchParams.get("tenant_id");

  // Cross-tenant path: only Wolfpack staff may name an arbitrary tenant.
  if (requestedTenantId) {
    const staff = await requireWolfpackStaff(request, "viewer");
    if (!isWolfpackStaff(staff)) return staff;

    const adapters = await listConfiguredEcommerceAdapters(requestedTenantId);
    return NextResponse.json({
      tenant_id: requestedTenantId,
      adapters,
      count: adapters.length,
      available_providers: listAvailableEcommerceAdapters(),
    });
  }

  // Tenant-side path: owner / admin only.
  if (auth.user.role !== "owner" && auth.user.role !== "admin") {
    return NextResponse.json(
      { error: "Insufficient permissions — tenant-admin required" },
      { status: 403 },
    );
  }

  // dealer_id on the auth.user is the vertical-agnostic tenant id (the same
  // column is reused across verticals — see migration 082 RLS policy).
  const tenantId = auth.user.dealer_id;
  const adapters = await listConfiguredEcommerceAdapters(tenantId);
  return NextResponse.json({
    tenant_id: tenantId,
    adapters,
    count: adapters.length,
    available_providers: listAvailableEcommerceAdapters(),
  });
}
