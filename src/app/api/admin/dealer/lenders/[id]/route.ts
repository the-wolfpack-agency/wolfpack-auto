/**
 * Dealer lender-route contact list -- single-record PATCH + DELETE.
 *
 * PATCH  /api/admin/dealer/lenders/[id]  -- update fields
 * DELETE /api/admin/dealer/lenders/[id]  -- remove
 *
 * Stream B, migration 070.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthenticated } from "@/lib/auth-guard";
import { getDealerId } from "@/lib/get-dealer-id";
import { auditLog } from "@/lib/audit-log";
import {
  updateLenderRoute,
  deleteLenderRoute,
  isValidLenderType,
  type UpdateLenderRouteInput,
  type LenderType,
} from "@/lib/prequal/lender-routing";

interface Ctx {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: NextRequest, ctx: Ctx) {
  const authResult = await requireAuth(request);
  if (!isAuthenticated(authResult)) return authResult;
  const dealerId = getDealerId(authResult);
  const { id } = await ctx.params;

  if (!id) {
    return NextResponse.json({ error: "Missing route id" }, { status: 400 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const patch: UpdateLenderRouteInput = {};
  if (typeof body.lender_name === "string") patch.lenderName = body.lender_name;
  if (typeof body.contact_email === "string") patch.contactEmail = body.contact_email;
  if (body.contact_name === null || typeof body.contact_name === "string")
    patch.contactName = body.contact_name as string | null;
  if (typeof body.sort_order === "number") patch.sortOrder = body.sort_order;
  if (typeof body.active === "boolean") patch.active = body.active;
  if (typeof body.lender_type === "string") {
    if (!isValidLenderType(body.lender_type)) {
      return NextResponse.json(
        {
          error:
            "lender_type must be one of: prime, sub_prime, captive, credit_union, other",
        },
        { status: 400 },
      );
    }
    patch.lenderType = body.lender_type as LenderType;
  }
  if (body.notes === null || typeof body.notes === "string")
    patch.notes = body.notes as string | null;

  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ route: null, shadow_mode: true }, { status: 200 });
  }

  try {
    const route = await updateLenderRoute(dealerId, id, patch);
    if (!route) {
      return NextResponse.json({ error: "Route not found" }, { status: 404 });
    }
    void auditLog(
      "prequal.lender_route.patch",
      { lender_route_id: id, patch },
      authResult.user.id,
      dealerId,
    );
    return NextResponse.json({ route });
  } catch (err) {
    const msg = (err as Error).message;
    if (msg.includes("required") || msg.includes("Invalid") || msg.includes("email") || msg.includes("empty")) {
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    console.error("[api/admin/dealer/lenders/:id] PATCH error:", err);
    return NextResponse.json({ error: "Failed to update lender route" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, ctx: Ctx) {
  const authResult = await requireAuth(request);
  if (!isAuthenticated(authResult)) return authResult;
  const dealerId = getDealerId(authResult);
  const { id } = await ctx.params;

  if (!id) {
    return NextResponse.json({ error: "Missing route id" }, { status: 400 });
  }

  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ ok: true, shadow_mode: true });
  }

  try {
    const deleted = await deleteLenderRoute(dealerId, id);
    if (!deleted) {
      return NextResponse.json({ error: "Route not found" }, { status: 404 });
    }
    void auditLog(
      "prequal.lender_route.delete",
      { lender_route_id: id },
      authResult.user.id,
      dealerId,
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[api/admin/dealer/lenders/:id] DELETE error:", err);
    return NextResponse.json({ error: "Failed to delete lender route" }, { status: 500 });
  }
}
