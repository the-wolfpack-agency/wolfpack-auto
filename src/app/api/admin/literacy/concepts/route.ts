/**
 * GET  /api/admin/literacy/concepts — list curated concepts (any staff role)
 * POST /api/admin/literacy/concepts — create a concept (operator+)
 *
 * Concepts are agency-shared curated ontology, not per-dealer data. The
 * write gate is requireWolfpackStaff (a dealer session — even an "admin"
 * dealer — gets 401). See migration 075 for the RLS rationale.
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
  createConcept,
  listConcepts,
  LiteracyValidationError,
} from "@/lib/literacy-ontology";
import type {
  ConceptDomain,
  CreateConceptInput,
} from "@/lib/literacy-ontology";

const ONTOLOGY_AUDIT_KEY = "wolfpack-ontology";

export async function GET(request: NextRequest) {
  const auth = await requireWolfpackStaff(request);
  if (!isWolfpackStaff(auth)) return auth;

  const url = request.nextUrl;
  const domain = (url.searchParams.get("domain") ?? undefined) as
    | ConceptDomain
    | undefined;
  const surface = url.searchParams.get("surface") ?? undefined;
  const limitParam = url.searchParams.get("limit");
  const limit = limitParam ? Number(limitParam) : undefined;

  try {
    const concepts = await listConcepts({ domain, surface, limit });
    return NextResponse.json({ concepts });
  } catch (err) {
    console.error("[literacy/concepts] GET error:", err);
    return NextResponse.json({ concepts: [] });
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireWolfpackStaff(request, "operator");
  if (!isWolfpackStaff(auth)) return auth;

  let body: Partial<CreateConceptInput>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.slug || !body.name || !body.domain) {
    return NextResponse.json(
      { error: "slug, name, domain are required" },
      { status: 400 },
    );
  }

  try {
    const concept = await createConcept(body as CreateConceptInput);

    trackLiteracy("literacy.concept_created", ONTOLOGY_AUDIT_KEY, {
      concept_id: concept.id,
      slug: concept.slug,
      domain: concept.domain,
      surface: concept.surface ?? "",
      staff_id: auth.staff.id,
    });

    await logStaffAction({
      staffId: auth.staff.id,
      action: "literacy.concept_created",
      targetType: "literacy_concept",
      targetId: concept.id,
      metadata: { slug: concept.slug, domain: concept.domain },
      ipAddress: getRequestIp(request),
      userAgent: request.headers.get("user-agent") ?? undefined,
    });

    return NextResponse.json({ concept }, { status: 201 });
  } catch (err) {
    if (err instanceof LiteracyValidationError) {
      return NextResponse.json(
        { error: err.message, field: err.field },
        { status: 400 },
      );
    }
    console.error("[literacy/concepts] POST error:", err);
    return NextResponse.json(
      { error: "Failed to create concept" },
      { status: 500 },
    );
  }
}
