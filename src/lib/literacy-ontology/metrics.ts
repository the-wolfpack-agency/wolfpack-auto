/**
 * Metrics CRUD — measurable signals attached to concepts.
 *
 * Metrics are the "what we measure" half of the ontology. Each metric points
 * at a concept (optional — metrics like `lead_response_time` aren't attached
 * to a single object) and has a unit + a good_direction.
 */

import type {
  CreateMetricInput,
  GoodDirection,
  LiteracyMetric,
  PatchMetricInput,
} from "./types";
import { GOOD_DIRECTIONS, SLUG_PATTERN } from "./types";
import { LiteracyValidationError } from "./concepts";

/* ------------------------------------------------------------------ */
/*  Validation                                                          */
/* ------------------------------------------------------------------ */

function validateCreate(input: CreateMetricInput): void {
  if (!input.slug || !SLUG_PATTERN.test(input.slug)) {
    throw new LiteracyValidationError("slug", `invalid slug: ${input.slug}`);
  }
  if (!input.name || input.name.trim().length === 0) {
    throw new LiteracyValidationError("name", "name is required");
  }
  if (
    input.good_direction !== undefined &&
    input.good_direction !== null &&
    !GOOD_DIRECTIONS.includes(input.good_direction)
  ) {
    throw new LiteracyValidationError(
      "good_direction",
      `good_direction must be one of ${GOOD_DIRECTIONS.join(", ")}`,
    );
  }
}

/* ------------------------------------------------------------------ */
/*  Reads                                                               */
/* ------------------------------------------------------------------ */

export async function listMetrics(opts: {
  concept_id?: string;
  good_direction?: GoodDirection;
  limit?: number;
} = {}): Promise<LiteracyMetric[]> {
  if (!process.env.DATABASE_URL) return [];
  const { query } = await import("@/lib/db");
  const where: string[] = [];
  const params: unknown[] = [];
  if (opts.concept_id) {
    params.push(opts.concept_id);
    where.push(`concept_id = $${params.length}`);
  }
  if (opts.good_direction) {
    params.push(opts.good_direction);
    where.push(`good_direction = $${params.length}`);
  }
  const sql = `
    SELECT id, slug, name, concept_id, unit, good_direction, description, created_at
      FROM literacy_metrics
      ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
      ORDER BY slug
      LIMIT ${Math.min(Math.max(opts.limit ?? 200, 1), 1000)}
  `;
  const result = await query<LiteracyMetric>(sql, params);
  return result.rows;
}

export async function getMetricBySlug(slug: string): Promise<LiteracyMetric | null> {
  if (!process.env.DATABASE_URL) return null;
  const { query } = await import("@/lib/db");
  const result = await query<LiteracyMetric>(
    `SELECT id, slug, name, concept_id, unit, good_direction, description, created_at
       FROM literacy_metrics WHERE slug = $1 LIMIT 1`,
    [slug],
  );
  return result.rows[0] ?? null;
}

export async function getMetricById(id: string): Promise<LiteracyMetric | null> {
  if (!process.env.DATABASE_URL) return null;
  const { query } = await import("@/lib/db");
  const result = await query<LiteracyMetric>(
    `SELECT id, slug, name, concept_id, unit, good_direction, description, created_at
       FROM literacy_metrics WHERE id = $1 LIMIT 1`,
    [id],
  );
  return result.rows[0] ?? null;
}

/* ------------------------------------------------------------------ */
/*  Writes                                                              */
/* ------------------------------------------------------------------ */

export async function createMetric(input: CreateMetricInput): Promise<LiteracyMetric> {
  validateCreate(input);
  if (!process.env.DATABASE_URL) throw new Error("createMetric requires DATABASE_URL");
  const { query } = await import("@/lib/db");

  const dupe = await query(
    `SELECT 1 FROM literacy_metrics WHERE slug = $1 LIMIT 1`,
    [input.slug],
  );
  if (dupe.rows.length > 0) {
    throw new LiteracyValidationError("slug", `slug already exists: ${input.slug}`);
  }

  const result = await query<LiteracyMetric>(
    `INSERT INTO literacy_metrics (slug, name, concept_id, unit, good_direction, description)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, slug, name, concept_id, unit, good_direction, description, created_at`,
    [
      input.slug,
      input.name,
      input.concept_id ?? null,
      input.unit ?? null,
      input.good_direction ?? null,
      input.description ?? null,
    ],
  );
  return result.rows[0];
}

export async function upsertMetricBySlug(input: CreateMetricInput): Promise<LiteracyMetric> {
  validateCreate(input);
  if (!process.env.DATABASE_URL) {
    throw new Error("upsertMetricBySlug requires DATABASE_URL");
  }
  const { query } = await import("@/lib/db");
  const result = await query<LiteracyMetric>(
    `INSERT INTO literacy_metrics (slug, name, concept_id, unit, good_direction, description)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (slug) DO UPDATE
       SET name = EXCLUDED.name,
           concept_id = EXCLUDED.concept_id,
           unit = EXCLUDED.unit,
           good_direction = EXCLUDED.good_direction,
           description = EXCLUDED.description
     RETURNING id, slug, name, concept_id, unit, good_direction, description, created_at`,
    [
      input.slug,
      input.name,
      input.concept_id ?? null,
      input.unit ?? null,
      input.good_direction ?? null,
      input.description ?? null,
    ],
  );
  return result.rows[0];
}

export async function patchMetric(
  id: string,
  patch: PatchMetricInput,
): Promise<LiteracyMetric | null> {
  if (patch.name !== undefined && patch.name.trim().length === 0) {
    throw new LiteracyValidationError("name", "name cannot be blank");
  }
  if (
    patch.good_direction !== undefined &&
    patch.good_direction !== null &&
    !GOOD_DIRECTIONS.includes(patch.good_direction)
  ) {
    throw new LiteracyValidationError(
      "good_direction",
      `invalid good_direction: ${patch.good_direction}`,
    );
  }
  if (!process.env.DATABASE_URL) throw new Error("patchMetric requires DATABASE_URL");
  const { query } = await import("@/lib/db");
  const sets: string[] = [];
  const params: unknown[] = [];
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    params.push(value);
    sets.push(`${key} = $${params.length}`);
  }
  if (sets.length === 0) return getMetricById(id);
  params.push(id);
  const result = await query<LiteracyMetric>(
    `UPDATE literacy_metrics SET ${sets.join(", ")}
      WHERE id = $${params.length}
      RETURNING id, slug, name, concept_id, unit, good_direction, description, created_at`,
    params,
  );
  return result.rows[0] ?? null;
}

export async function deleteMetric(id: string): Promise<boolean> {
  if (!process.env.DATABASE_URL) throw new Error("deleteMetric requires DATABASE_URL");
  const { query } = await import("@/lib/db");
  const result = await query(
    `DELETE FROM literacy_metrics WHERE id = $1 RETURNING id`,
    [id],
  );
  return result.rows.length > 0;
}
