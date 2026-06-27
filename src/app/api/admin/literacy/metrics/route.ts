/**
 * GET  /api/admin/literacy/metrics — list metrics (any staff role)
 * POST /api/admin/literacy/metrics — create a metric (operator+)
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
  createMetric,
  listMetrics,
  LiteracyValidationError,
} from "@/lib/literacy-ontology";
import type {
  CreateMetricInput,
  GoodDirection,
} from "@/lib/literacy-ontology";

const ONTOLOGY_AUDIT_KEY = "wolfpack-ontology";

export async function GET(request: NextRequest) {
  const auth = await requireWolfpackStaff(request);
  if (!isWolfpackStaff(auth)) return auth;

  if (!process.env.DATABASE_URL) {
    // Shadow mode (no database): degrade gracefully instead of crashing.
    return NextResponse.json({ metrics: [] }, { status: 200 });
  }

  const url = request.nextUrl;
  const concept_id = url.searchParams.get("concept_id") ?? undefined;
  const good_direction = (url.searchParams.get("good_direction") ?? undefined) as
    | GoodDirection
    | undefined;
  const limit = url.searchParams.get("limit")
    ? Number(url.searchParams.get("limit"))
    : undefined;

  try {
    const metrics = await listMetrics({ concept_id, good_direction, limit });
    return NextResponse.json({ metrics });
  } catch (err) {
    console.error("[literacy/metrics] GET error:", err);
    return NextResponse.json({ metrics: [] });
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireWolfpackStaff(request, "operator");
  if (!isWolfpackStaff(auth)) return auth;

  if (!process.env.DATABASE_URL) {
    // Shadow mode (no database): degrade gracefully instead of crashing.
    return NextResponse.json(
      { error: "service_unavailable", shadow: true },
      { status: 503 },
    );
  }

  let body: Partial<CreateMetricInput>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.slug || !body.name) {
    return NextResponse.json(
      { error: "slug, name are required" },
      { status: 400 },
    );
  }

  try {
    const metric = await createMetric(body as CreateMetricInput);
    trackLiteracy("literacy.metric_created", ONTOLOGY_AUDIT_KEY, {
      metric_id: metric.id,
      slug: metric.slug,
      staff_id: auth.staff.id,
    });
    await logStaffAction({
      staffId: auth.staff.id,
      action: "literacy.metric_created",
      targetType: "literacy_metric",
      targetId: metric.id,
      metadata: { slug: metric.slug, unit: metric.unit ?? "" },
      ipAddress: getRequestIp(request),
      userAgent: request.headers.get("user-agent") ?? undefined,
    });
    return NextResponse.json({ metric }, { status: 201 });
  } catch (err) {
    if (err instanceof LiteracyValidationError) {
      return NextResponse.json(
        { error: err.message, field: err.field },
        { status: 400 },
      );
    }
    console.error("[literacy/metrics] POST error:", err);
    return NextResponse.json(
      { error: "Failed to create metric" },
      { status: 500 },
    );
  }
}
