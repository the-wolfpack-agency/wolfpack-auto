/**
 * GET  /api/admin/literacy/mappings — list mappings (any staff role)
 * POST /api/admin/literacy/mappings — create a mapping (operator+)
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
  createMapping,
  listMappings,
  LiteracyValidationError,
} from "@/lib/literacy-ontology";
import type {
  CreateMappingInput,
  MappingRelation,
} from "@/lib/literacy-ontology";

const ONTOLOGY_AUDIT_KEY = "wolfpack-ontology";

export async function GET(request: NextRequest) {
  const auth = await requireWolfpackStaff(request);
  if (!isWolfpackStaff(auth)) return auth;

  if (!process.env.DATABASE_URL) {
    // Shadow mode (no database): degrade gracefully instead of crashing.
    return NextResponse.json({ mappings: [] }, { status: 200 });
  }

  const url = request.nextUrl;
  const source_concept_id = url.searchParams.get("source_concept_id") ?? undefined;
  const target_concept_id = url.searchParams.get("target_concept_id") ?? undefined;
  const relation = (url.searchParams.get("relation") ?? undefined) as
    | MappingRelation
    | undefined;
  const limit = url.searchParams.get("limit")
    ? Number(url.searchParams.get("limit"))
    : undefined;

  try {
    const mappings = await listMappings({
      source_concept_id,
      target_concept_id,
      relation,
      limit,
    });
    return NextResponse.json({ mappings });
  } catch (err) {
    console.error("[literacy/mappings] GET error:", err);
    return NextResponse.json({ mappings: [] });
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

  let body: Partial<CreateMappingInput>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.source_concept_id || !body.target_concept_id || !body.relation) {
    return NextResponse.json(
      { error: "source_concept_id, target_concept_id, relation are required" },
      { status: 400 },
    );
  }

  try {
    const mapping = await createMapping(body as CreateMappingInput);
    trackLiteracy("literacy.mapping_created", ONTOLOGY_AUDIT_KEY, {
      mapping_id: mapping.id,
      relation: mapping.relation,
      source_concept_id: mapping.source_concept_id,
      target_concept_id: mapping.target_concept_id,
      staff_id: auth.staff.id,
    });
    await logStaffAction({
      staffId: auth.staff.id,
      action: "literacy.mapping_created",
      targetType: "literacy_mapping",
      targetId: mapping.id,
      metadata: {
        relation: mapping.relation,
        source_concept_id: mapping.source_concept_id,
        target_concept_id: mapping.target_concept_id,
      },
      ipAddress: getRequestIp(request),
      userAgent: request.headers.get("user-agent") ?? undefined,
    });
    return NextResponse.json({ mapping }, { status: 201 });
  } catch (err) {
    if (err instanceof LiteracyValidationError) {
      return NextResponse.json(
        { error: err.message, field: err.field },
        { status: 400 },
      );
    }
    console.error("[literacy/mappings] POST error:", err);
    return NextResponse.json(
      { error: "Failed to create mapping" },
      { status: 500 },
    );
  }
}
