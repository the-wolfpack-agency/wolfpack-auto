/**
 * GET    /api/admin/literacy/metrics/[id]
 * PATCH  /api/admin/literacy/metrics/[id] (operator+)
 * DELETE /api/admin/literacy/metrics/[id] (admin)
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
  deleteMetric,
  getMetricById,
  patchMetric,
  LiteracyValidationError,
} from "@/lib/literacy-ontology";
import type { PatchMetricInput } from "@/lib/literacy-ontology";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ONTOLOGY_AUDIT_KEY = "wolfpack-ontology";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireWolfpackStaff(request);
  if (!isWolfpackStaff(auth)) return auth;
  if (!process.env.DATABASE_URL) {
    // Shadow mode (no database): degrade gracefully instead of crashing.
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const params = await Promise.resolve(context.params);
  if (!UUID.test(params.id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  try {
    const metric = await getMetricById(params.id);
    if (!metric) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ metric });
  } catch (err) {
    console.error("[literacy/metrics/[id]] GET error:", err);
    return NextResponse.json({ error: "Failed to load metric" }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireWolfpackStaff(request, "operator");
  if (!isWolfpackStaff(auth)) return auth;
  if (!process.env.DATABASE_URL) {
    // Shadow mode (no database): degrade gracefully instead of crashing.
    return NextResponse.json(
      { error: "service_unavailable", shadow: true },
      { status: 503 },
    );
  }
  const params = await Promise.resolve(context.params);
  if (!UUID.test(params.id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  let body: PatchMetricInput;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  try {
    const metric = await patchMetric(params.id, body);
    if (!metric) return NextResponse.json({ error: "Not found" }, { status: 404 });
    trackLiteracy("literacy.metric_updated", ONTOLOGY_AUDIT_KEY, {
      metric_id: metric.id,
      slug: metric.slug,
      staff_id: auth.staff.id,
    });
    await logStaffAction({
      staffId: auth.staff.id,
      action: "literacy.metric_updated",
      targetType: "literacy_metric",
      targetId: metric.id,
      metadata: { ...body },
      ipAddress: getRequestIp(request),
      userAgent: request.headers.get("user-agent") ?? undefined,
    });
    return NextResponse.json({ metric });
  } catch (err) {
    if (err instanceof LiteracyValidationError) {
      return NextResponse.json(
        { error: err.message, field: err.field },
        { status: 400 },
      );
    }
    console.error("[literacy/metrics/[id]] PATCH error:", err);
    return NextResponse.json({ error: "Failed to update metric" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireWolfpackStaff(request, "admin");
  if (!isWolfpackStaff(auth)) return auth;
  if (!process.env.DATABASE_URL) {
    // Shadow mode (no database): degrade gracefully instead of crashing.
    return NextResponse.json(
      { error: "service_unavailable", shadow: true },
      { status: 503 },
    );
  }
  const params = await Promise.resolve(context.params);
  if (!UUID.test(params.id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  try {
    const ok = await deleteMetric(params.id);
    if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
    trackLiteracy("literacy.metric_deleted", ONTOLOGY_AUDIT_KEY, {
      metric_id: params.id,
      staff_id: auth.staff.id,
    });
    await logStaffAction({
      staffId: auth.staff.id,
      action: "literacy.metric_deleted",
      targetType: "literacy_metric",
      targetId: params.id,
      ipAddress: getRequestIp(request),
      userAgent: request.headers.get("user-agent") ?? undefined,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[literacy/metrics/[id]] DELETE error:", err);
    return NextResponse.json({ error: "Failed to delete metric" }, { status: 500 });
  }
}
