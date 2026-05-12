/**
 * GET  /api/admin/literacy/translations — list translations (any staff role)
 * POST /api/admin/literacy/translations — create a translation (operator+)
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
  createTranslation,
  listTranslations,
  LiteracyValidationError,
} from "@/lib/literacy-ontology";
import type {
  CreateTranslationInput,
  LiteracyRole,
} from "@/lib/literacy-ontology";

const ONTOLOGY_AUDIT_KEY = "wolfpack-ontology";

export async function GET(request: NextRequest) {
  const auth = await requireWolfpackStaff(request);
  if (!isWolfpackStaff(auth)) return auth;

  const url = request.nextUrl;
  const metric_id = url.searchParams.get("metric_id") ?? undefined;
  const role = (url.searchParams.get("role") ?? undefined) as
    | LiteracyRole
    | undefined;
  const limit = url.searchParams.get("limit")
    ? Number(url.searchParams.get("limit"))
    : undefined;

  try {
    const translations = await listTranslations({ metric_id, role, limit });
    return NextResponse.json({ translations });
  } catch (err) {
    console.error("[literacy/translations] GET error:", err);
    return NextResponse.json({ translations: [] });
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireWolfpackStaff(request, "operator");
  if (!isWolfpackStaff(auth)) return auth;

  let body: Partial<CreateTranslationInput>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.metric_id || !body.role || !body.template) {
    return NextResponse.json(
      { error: "metric_id, role, template are required" },
      { status: 400 },
    );
  }

  try {
    const translation = await createTranslation(body as CreateTranslationInput);
    trackLiteracy("literacy.translation_created", ONTOLOGY_AUDIT_KEY, {
      translation_id: translation.id,
      metric_id: translation.metric_id,
      role: translation.role,
      source: translation.source,
      staff_id: auth.staff.id,
    });
    await logStaffAction({
      staffId: auth.staff.id,
      action: "literacy.translation_created",
      targetType: "literacy_translation",
      targetId: translation.id,
      metadata: {
        metric_id: translation.metric_id,
        role: translation.role,
        source: translation.source,
      },
      ipAddress: getRequestIp(request),
      userAgent: request.headers.get("user-agent") ?? undefined,
    });
    return NextResponse.json({ translation }, { status: 201 });
  } catch (err) {
    if (err instanceof LiteracyValidationError) {
      return NextResponse.json(
        { error: err.message, field: err.field },
        { status: 400 },
      );
    }
    console.error("[literacy/translations] POST error:", err);
    return NextResponse.json(
      { error: "Failed to create translation" },
      { status: 500 },
    );
  }
}
