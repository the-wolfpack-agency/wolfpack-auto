/**
 * Tooltips CRUD — short + expanded explanations per (concept, role).
 *
 * Tooltips are SHARED ACROSS DEALERS (curated content). The write gate is
 * requireWolfpackStaff at the route layer. Per-dealer interaction signal
 * (tooltip.opened / tooltip.dismissed) goes through trackLiteracy.
 *
 * Each tooltip is keyed on (concept_id, role) — refining wording for the
 * same audience updates in place rather than producing duplicates. A
 * dedicated unique index in migration 076 enforces this.
 */

import { LITERACY_ROLES, LITERACY_SOURCES } from "@/lib/literacy-ontology";
import { LiteracyValidationError } from "@/lib/literacy-ontology";
import type { LiteracyRole, LiteracySource } from "@/lib/literacy-ontology";

/* ------------------------------------------------------------------ */
/*  Types                                                               */
/* ------------------------------------------------------------------ */

export interface LiteracyTooltip {
  id: string;
  concept_id: string;
  role: LiteracyRole;
  short_text: string;
  expanded_text: string | null;
  source: LiteracySource;
  quality_score: number;
  created_at: string;
}

export interface CreateTooltipInput {
  concept_id: string;
  role: LiteracyRole;
  short_text: string;
  expanded_text?: string | null;
  source?: LiteracySource;
  quality_score?: number;
}

export interface PatchTooltipInput {
  short_text?: string;
  expanded_text?: string | null;
  source?: LiteracySource;
  quality_score?: number;
}

/* ------------------------------------------------------------------ */
/*  Validation                                                          */
/* ------------------------------------------------------------------ */

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function validateCreate(input: CreateTooltipInput): void {
  if (!input.concept_id || !UUID_PATTERN.test(input.concept_id)) {
    throw new LiteracyValidationError(
      "concept_id",
      "concept_id (UUID) is required",
    );
  }
  if (!LITERACY_ROLES.includes(input.role)) {
    throw new LiteracyValidationError("role", `invalid role: ${input.role}`);
  }
  if (!input.short_text || input.short_text.trim().length === 0) {
    throw new LiteracyValidationError(
      "short_text",
      "short_text is required",
    );
  }
  if (input.source !== undefined && !LITERACY_SOURCES.includes(input.source)) {
    throw new LiteracyValidationError("source", `invalid source: ${input.source}`);
  }
  if (input.quality_score !== undefined) {
    if (
      typeof input.quality_score !== "number" ||
      input.quality_score < 0 ||
      input.quality_score > 1
    ) {
      throw new LiteracyValidationError(
        "quality_score",
        "quality_score must be a number in [0, 1]",
      );
    }
  }
}

/* ------------------------------------------------------------------ */
/*  Reads                                                               */
/* ------------------------------------------------------------------ */

export async function listTooltips(opts: {
  concept_id?: string;
  role?: LiteracyRole;
  limit?: number;
} = {}): Promise<LiteracyTooltip[]> {
  if (!process.env.DATABASE_URL) return [];
  const { query } = await import("@/lib/db");
  const where: string[] = [];
  const params: unknown[] = [];
  if (opts.concept_id) {
    params.push(opts.concept_id);
    where.push(`concept_id = $${params.length}`);
  }
  if (opts.role) {
    params.push(opts.role);
    where.push(`role = $${params.length}`);
  }
  const sql = `
    SELECT id, concept_id, role, short_text, expanded_text, source,
           quality_score::float AS quality_score, created_at
      FROM literacy_tooltips
      ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
      ORDER BY role, created_at DESC
      LIMIT ${Math.min(Math.max(opts.limit ?? 200, 1), 1000)}
  `;
  const result = await query<LiteracyTooltip>(sql, params);
  return result.rows;
}

export async function getTooltipById(
  id: string,
): Promise<LiteracyTooltip | null> {
  if (!process.env.DATABASE_URL) return null;
  const { query } = await import("@/lib/db");
  const result = await query<LiteracyTooltip>(
    `SELECT id, concept_id, role, short_text, expanded_text, source,
            quality_score::float AS quality_score, created_at
       FROM literacy_tooltips
      WHERE id = $1
      LIMIT 1`,
    [id],
  );
  return result.rows[0] ?? null;
}

/**
 * Role-aware tooltip lookup keyed on the concept slug, mirroring the
 * fallback ladder migration 075 uses for translations. Returns null when
 * no tooltip exists for any role on that concept.
 */
export async function getTooltipForConcept(
  conceptSlug: string,
  role: LiteracyRole,
): Promise<LiteracyTooltip | null> {
  if (!process.env.DATABASE_URL) return null;
  const { query } = await import("@/lib/db");
  const result = await query<LiteracyTooltip>(
    `SELECT t.id, t.concept_id, t.role, t.short_text, t.expanded_text,
            t.source, t.quality_score::float AS quality_score, t.created_at
       FROM literacy_tooltips t
       JOIN literacy_concepts c ON c.id = t.concept_id
      WHERE c.slug = $1
        AND (t.role = $2 OR t.role = 'any')
      ORDER BY
        (t.role = $2) DESC,
        t.quality_score DESC,
        t.created_at DESC
      LIMIT 1`,
    [conceptSlug, role],
  );
  return result.rows[0] ?? null;
}

/* ------------------------------------------------------------------ */
/*  Writes                                                              */
/* ------------------------------------------------------------------ */

export async function createTooltip(
  input: CreateTooltipInput,
): Promise<LiteracyTooltip> {
  validateCreate(input);
  if (!process.env.DATABASE_URL) {
    throw new Error("createTooltip requires DATABASE_URL");
  }
  const { query } = await import("@/lib/db");

  // Pre-flight (concept_id, role) uniqueness for a typed error.
  const dupe = await query(
    `SELECT 1 FROM literacy_tooltips WHERE concept_id = $1 AND role = $2 LIMIT 1`,
    [input.concept_id, input.role],
  );
  if (dupe.rows.length > 0) {
    throw new LiteracyValidationError(
      "concept_id|role",
      "tooltip already exists for this (concept, role) pair — PATCH to refine",
    );
  }

  const result = await query<LiteracyTooltip>(
    `INSERT INTO literacy_tooltips
       (concept_id, role, short_text, expanded_text, source, quality_score)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, concept_id, role, short_text, expanded_text, source,
               quality_score::float AS quality_score, created_at`,
    [
      input.concept_id,
      input.role,
      input.short_text,
      input.expanded_text ?? null,
      input.source ?? "ai_proposed",
      input.quality_score ?? 0.5,
    ],
  );
  return result.rows[0];
}

export async function patchTooltip(
  id: string,
  patch: PatchTooltipInput,
): Promise<LiteracyTooltip | null> {
  if (patch.short_text !== undefined && patch.short_text.trim().length === 0) {
    throw new LiteracyValidationError(
      "short_text",
      "short_text cannot be blank",
    );
  }
  if (
    patch.source !== undefined &&
    !LITERACY_SOURCES.includes(patch.source)
  ) {
    throw new LiteracyValidationError("source", `invalid source: ${patch.source}`);
  }
  if (patch.quality_score !== undefined) {
    if (
      typeof patch.quality_score !== "number" ||
      patch.quality_score < 0 ||
      patch.quality_score > 1
    ) {
      throw new LiteracyValidationError(
        "quality_score",
        "quality_score must be a number in [0, 1]",
      );
    }
  }
  if (!process.env.DATABASE_URL) {
    throw new Error("patchTooltip requires DATABASE_URL");
  }
  const { query } = await import("@/lib/db");

  const sets: string[] = [];
  const params: unknown[] = [];
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    params.push(value);
    sets.push(`${key} = $${params.length}`);
  }
  if (sets.length === 0) {
    return getTooltipById(id);
  }
  params.push(id);
  const result = await query<LiteracyTooltip>(
    `UPDATE literacy_tooltips SET ${sets.join(", ")}
      WHERE id = $${params.length}
      RETURNING id, concept_id, role, short_text, expanded_text, source,
                quality_score::float AS quality_score, created_at`,
    params,
  );
  return result.rows[0] ?? null;
}

export async function deleteTooltip(id: string): Promise<boolean> {
  if (!process.env.DATABASE_URL) {
    throw new Error("deleteTooltip requires DATABASE_URL");
  }
  const { query } = await import("@/lib/db");
  const result = await query(
    `DELETE FROM literacy_tooltips WHERE id = $1 RETURNING id`,
    [id],
  );
  return result.rows.length > 0;
}
