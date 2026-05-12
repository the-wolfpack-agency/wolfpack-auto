/**
 * GET  /api/admin/literacy/actions — list actions (any staff role)
 * POST /api/admin/literacy/actions — create an action (operator+)
 */

import { NextRequest, NextResponse } from "next/server";
import {
  requireWolfpackStaff,
  isWolfpackStaff,
  getRequestIp,
} from "@/lib/operator-auth";
import { logStaffAction } from "@/lib/wolfpack-staff-audit";
import { trackLiteracy } from "@/lib/analytics-hooks";
import {
  createAction,
  listActions,
  LiteracyValidationError,
} from "@/lib/literacy-ontology";
import type {
  CreateActionInput,
  LiteracyActionRole,
} from "@/lib/literacy-ontology";

const ONTOLOGY_AUDIT_KEY = "wolfpack-ontology";

export async function GET(request: NextRequest) {
  const auth = await requireWolfpackStaff(request);
  if (!isWolfpackStaff(auth)) return auth;

  const url = request.nextUrl;
  const metric_id = url.searchParams.get("metric_id") ?? undefined;
  const role = (url.searchParams.get("role") ?? undefined) as
    | LiteracyActionRole
    | undefined;
  const trigger_condition =
    url.searchParams.get("trigger_condition") ?? undefined;
  const limit = url.searchParams.get("limit")
    ? Number(url.searchParams.get("limit"))
    : undefined;

  try {
    const actions = await listActions({
      metric_id,
      role,
      trigger_condition,
      limit,
    });
    return NextResponse.json({ actions });
  } catch (err) {
    console.error("[literacy/actions] GET error:", err);
    return NextResponse.json({ actions: [] });
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireWolfpackStaff(request, "operator");
  if (!isWolfpackStaff(auth)) return auth;

  let body: Partial<CreateActionInput>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (
    !body.metric_id ||
    !body.role ||
    !body.trigger_condition ||
    !body.recommendation_template
  ) {
    return NextResponse.json(
      {
        error:
          "metric_id, role, trigger_condition, recommendation_template are required",
      },
      { status: 400 },
    );
  }

  try {
    const action = await createAction(body as CreateActionInput);
    trackLiteracy("literacy.action_created", ONTOLOGY_AUDIT_KEY, {
      action_id: action.id,
      metric_id: action.metric_id,
      role: action.role,
      trigger_condition: action.trigger_condition,
      staff_id: auth.staff.id,
    });
    await logStaffAction({
      staffId: auth.staff.id,
      action: "literacy.action_created",
      targetType: "literacy_action",
      targetId: action.id,
      metadata: {
        metric_id: action.metric_id,
        role: action.role,
        trigger_condition: action.trigger_condition,
      },
      ipAddress: getRequestIp(request),
      userAgent: request.headers.get("user-agent") ?? undefined,
    });
    return NextResponse.json({ action }, { status: 201 });
  } catch (err) {
    if (err instanceof LiteracyValidationError) {
      return NextResponse.json(
        { error: err.message, field: err.field },
        { status: 400 },
      );
    }
    console.error("[literacy/actions] POST error:", err);
    return NextResponse.json(
      { error: "Failed to create action" },
      { status: 500 },
    );
  }
}
