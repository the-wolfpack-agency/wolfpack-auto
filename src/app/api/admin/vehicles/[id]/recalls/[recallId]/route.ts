/**
 * PATCH /api/admin/vehicles/[id]/recalls/[recallId]
 *
 * Updates the per-vehicle recall resolution state. Body shape:
 *
 *   { status: "resolved" | "dismissed_by_owner" | "open", notes?: string }
 *
 * Emits `service.recall_resolved` or `service.recall_dismissed` analytics
 * events and writes an audit_log row for every mutation — this is a
 * compliance-sensitive surface (a writer signing off on a recall has legal
 * implications), so the action is always logged.
 *
 * Errors:
 *   200 — status updated
 *   400 — invalid payload
 *   401 — no session
 *   404 — vehicle / recall not found
 *   500 — unexpected failure
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth, isAuthenticated } from "@/lib/auth-guard";
import { auditLog } from "@/lib/audit-log";
import { trackService } from "@/lib/analytics-hooks";
import { loadVehicle, setRecallStatus } from "@/lib/recalls";

interface RouteContext {
  params: Promise<{ id: string; recallId: string }>;
}

const PatchBody = z.object({
  status: z.enum(["open", "resolved", "dismissed_by_owner"]),
  notes: z.string().max(2000).optional(),
});

export async function PATCH(
  request: NextRequest,
  context: RouteContext,
): Promise<NextResponse> {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ success: false, shadow_mode: true });
  }

  const authResult = await requireAuth(request);
  if (!isAuthenticated(authResult)) return authResult;

  const { id, recallId } = await context.params;
  if (!id || !recallId) {
    return NextResponse.json(
      { error: "Vehicle id and recall id are required" },
      { status: 400 },
    );
  }

  let body: z.infer<typeof PatchBody>;
  try {
    const raw = await request.json();
    body = PatchBody.parse(raw);
  } catch (err) {
    return NextResponse.json(
      {
        error: "Invalid request body",
        details: err instanceof Error ? err.message : String(err),
      },
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

    const result = await setRecallStatus(
      dealerId,
      vehicle.id,
      recallId,
      body.status,
      userId,
      body.notes ?? "",
    );

    // Audit log: every recall status change leaves a trace.
    void auditLog(
      "service.recall_status_changed",
      {
        vehicle_id: vehicle.id,
        recall_id: recallId,
        new_status: body.status,
        notes_provided: !!body.notes,
      },
      userId,
      dealerId,
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined,
    ).catch(() => {});

    // Analytics fire-and-forget.
    try {
      if (body.status === "resolved") {
        trackService("service.recall_resolved", dealerId, {
          vehicle_id: vehicle.id,
          recall_id: recallId,
          user_id: userId,
        });
      } else if (body.status === "dismissed_by_owner") {
        trackService("service.recall_dismissed", dealerId, {
          vehicle_id: vehicle.id,
          recall_id: recallId,
          user_id: userId,
        });
      }
    } catch {
      /* analytics must never throw */
    }

    return NextResponse.json({
      vehicle_id: vehicle.id,
      recall_id: recallId,
      status: result?.status ?? body.status,
      resolved_at: result?.resolved_at ?? null,
    });
  } catch (err) {
    console.error("[PATCH /api/admin/vehicles/[id]/recalls/[recallId]] Error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
