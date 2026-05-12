/**
 * Dealer lender-route contact list -- GET + POST.
 *
 * GET  /api/admin/dealer/lenders         -- list active + inactive routes
 * POST /api/admin/dealer/lenders         -- add a new route
 *
 * Reserved for Stream B (prequal lender packet routing, migration 070).
 *
 * Not to be confused with the legacy `/api/admin/lenders/*` which is the
 * desking lender catalog. This namespace is specifically for prequal
 * outbound packet routing.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthenticated } from "@/lib/auth-guard";
import { getDealerId } from "@/lib/get-dealer-id";
import { auditLog } from "@/lib/audit-log";
import {
  listLenderRoutes,
  createLenderRoute,
  isValidLenderType,
  type LenderType,
} from "@/lib/prequal/lender-routing";

export async function GET(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (!isAuthenticated(authResult)) return authResult;
  const dealerId = getDealerId(authResult);

  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ routes: [], shadow_mode: true });
  }

  try {
    const routes = await listLenderRoutes(dealerId);
    return NextResponse.json({ routes });
  } catch (err) {
    console.error("[api/admin/dealer/lenders] GET error:", err);
    return NextResponse.json(
      { error: "Failed to load lender routes" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (!isAuthenticated(authResult)) return authResult;
  const dealerId = getDealerId(authResult);

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const {
    lender_name,
    contact_email,
    contact_name,
    sort_order,
    lender_type,
    notes,
  } = body as {
    lender_name?: string;
    contact_email?: string;
    contact_name?: string;
    sort_order?: number;
    lender_type?: string;
    notes?: string;
  };

  if (!lender_name || typeof lender_name !== "string" || !lender_name.trim()) {
    return NextResponse.json(
      { error: "lender_name is required" },
      { status: 400 },
    );
  }
  if (!contact_email || typeof contact_email !== "string") {
    return NextResponse.json(
      { error: "contact_email is required" },
      { status: 400 },
    );
  }
  const typedLenderType: LenderType =
    lender_type && isValidLenderType(lender_type) ? lender_type : "other";
  if (lender_type && !isValidLenderType(lender_type)) {
    return NextResponse.json(
      {
        error:
          "lender_type must be one of: prime, sub_prime, captive, credit_union, other",
      },
      { status: 400 },
    );
  }

  if (!process.env.DATABASE_URL) {
    // Shadow-mode fallback so the wizard still demos.
    const shadow = {
      id: `shadow-${Date.now().toString(36)}`,
      dealerId,
      lenderName: lender_name.trim(),
      contactEmail: contact_email.trim().toLowerCase(),
      contactName: contact_name ?? null,
      sortOrder: sort_order ?? 0,
      active: true,
      lenderType: typedLenderType,
      notes: notes ?? null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    return NextResponse.json({ route: shadow, shadow_mode: true }, { status: 201 });
  }

  try {
    const route = await createLenderRoute({
      dealerId,
      lenderName: lender_name,
      contactEmail: contact_email,
      contactName: contact_name ?? null,
      sortOrder: sort_order ?? 0,
      lenderType: typedLenderType,
      notes: notes ?? null,
    });
    void auditLog(
      "prequal.lender_route.add",
      { lender_route_id: route.id, lender_name: route.lenderName },
      authResult.user.id,
      dealerId,
    );
    return NextResponse.json({ route }, { status: 201 });
  } catch (err) {
    const msg = (err as Error).message;
    if (msg.includes("required") || msg.includes("Invalid") || msg.includes("email")) {
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    console.error("[api/admin/dealer/lenders] POST error:", err);
    return NextResponse.json({ error: "Failed to create lender route" }, { status: 500 });
  }
}
