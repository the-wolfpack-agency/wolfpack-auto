/**
 * Translations CRUD — role-specific phrasings of metrics in lot-language.
 *
 * Templates use `{value}` and `{metric}` placeholders plus any additional
 * variable names the caller wants to splice in (e.g. `{analog}`,
 * `{benchmark}`). `renderTemplate` substitutes safely (single-pass, no
 * recursive expansion).
 */

import type {
  CreateTranslationInput,
  LiteracyRole,
  LiteracyTranslation,
  PatchTranslationInput,
} from "./types";
import { LITERACY_ROLES, LITERACY_SOURCES } from "./types";
import { LiteracyValidationError } from "./concepts";
import { getMetricBySlug } from "./metrics";

/* ------------------------------------------------------------------ */
/*  Validation                                                          */
/* ------------------------------------------------------------------ */

function validateCreate(input: CreateTranslationInput): void {
  if (!input.metric_id) {
    throw new LiteracyValidationError("metric_id", "metric_id is required");
  }
  if (!LITERACY_ROLES.includes(input.role)) {
    throw new LiteracyValidationError("role", `invalid role: ${input.role}`);
  }
  if (!input.template || input.template.trim().length === 0) {
    throw new LiteracyValidationError("template", "template is required");
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

export async function listTranslations(opts: {
  metric_id?: string;
  role?: LiteracyRole;
  limit?: number;
} = {}): Promise<LiteracyTranslation[]> {
  if (!process.env.DATABASE_URL) return [];
  const { query } = await import("@/lib/db");
  const where: string[] = [];
  const params: unknown[] = [];
  if (opts.metric_id) {
    params.push(opts.metric_id);
    where.push(`metric_id = $${params.length}`);
  }
  if (opts.role) {
    params.push(opts.role);
    where.push(`role = $${params.length}`);
  }
  const sql = `
    SELECT id, metric_id, role, context, template, source,
           quality_score::float AS quality_score, created_at
      FROM literacy_translations
      ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
      ORDER BY role, created_at DESC
      LIMIT ${Math.min(Math.max(opts.limit ?? 200, 1), 1000)}
  `;
  const result = await query<LiteracyTranslation>(sql, params);
  return result.rows;
}

/**
 * Look up a translation by (metric_slug, role, [context]) and render it
 * with the supplied variables.
 *
 * Falls back to role=`any` if no role-specific translation exists, so every
 * metric has at least one rendering even without a curated translation for
 * the asking role.
 *
 * Returns null when the metric does not exist OR when there is no
 * translation at all for that metric (any role, any context).
 */
export async function getTranslation(
  metricSlug: string,
  role: LiteracyRole,
  variables: Record<string, string | number | null | undefined> = {},
  context?: string,
): Promise<{ rendered: string; translation: LiteracyTranslation } | null> {
  if (!process.env.DATABASE_URL) return null;
  const metric = await getMetricBySlug(metricSlug);
  if (!metric) return null;

  const { query } = await import("@/lib/db");
  // Prefer exact (role, context); fall back to role with NULL context;
  // fall back to role=any; finally fall back to any/any.
  const result = await query<LiteracyTranslation>(
    `SELECT id, metric_id, role, context, template, source,
            quality_score::float AS quality_score, created_at
       FROM literacy_translations
      WHERE metric_id = $1
        AND (
          (role = $2 AND COALESCE(context, '') = COALESCE($3, ''))
          OR (role = $2 AND context IS NULL)
          OR (role = 'any' AND COALESCE(context, '') = COALESCE($3, ''))
          OR (role = 'any' AND context IS NULL)
        )
      ORDER BY
        (role = $2 AND COALESCE(context, '') = COALESCE($3, '')) DESC,
        (role = $2) DESC,
        (COALESCE(context, '') = COALESCE($3, '')) DESC,
        quality_score DESC
      LIMIT 1`,
    [metric.id, role, context ?? null],
  );
  const translation = result.rows[0];
  if (!translation) return null;

  const rendered = renderTemplate(translation.template, {
    metric: metric.name,
    ...variables,
  });
  return { rendered, translation };
}

/* ------------------------------------------------------------------ */
/*  Template rendering (single-pass {var} substitution)                 */
/* ------------------------------------------------------------------ */

const VAR_PATTERN = /\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g;

export function renderTemplate(
  template: string,
  variables: Record<string, string | number | null | undefined>,
): string {
  return template.replace(VAR_PATTERN, (match, key) => {
    const value = variables[key];
    if (value === null || value === undefined) return match;
    return String(value);
  });
}

/* ------------------------------------------------------------------ */
/*  Writes                                                              */
/* ------------------------------------------------------------------ */

export async function createTranslation(
  input: CreateTranslationInput,
): Promise<LiteracyTranslation> {
  validateCreate(input);
  if (!process.env.DATABASE_URL) {
    throw new Error("createTranslation requires DATABASE_URL");
  }
  const { query } = await import("@/lib/db");
  const result = await query<LiteracyTranslation>(
    `INSERT INTO literacy_translations
       (metric_id, role, context, template, source, quality_score)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, metric_id, role, context, template, source,
               quality_score::float AS quality_score, created_at`,
    [
      input.metric_id,
      input.role,
      input.context ?? null,
      input.template,
      input.source ?? "curated",
      input.quality_score ?? 0.5,
    ],
  );
  return result.rows[0];
}

/** Upsert keyed on (metric, role, context) for seed idempotence. */
export async function upsertTranslation(
  input: CreateTranslationInput,
): Promise<LiteracyTranslation> {
  validateCreate(input);
  if (!process.env.DATABASE_URL) {
    throw new Error("upsertTranslation requires DATABASE_URL");
  }
  const { query } = await import("@/lib/db");
  const result = await query<LiteracyTranslation>(
    `INSERT INTO literacy_translations
       (metric_id, role, context, template, source, quality_score)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (metric_id, role, (COALESCE(context, ''))) DO UPDATE
       SET template = EXCLUDED.template,
           source = EXCLUDED.source,
           quality_score = EXCLUDED.quality_score
     RETURNING id, metric_id, role, context, template, source,
               quality_score::float AS quality_score, created_at`,
    [
      input.metric_id,
      input.role,
      input.context ?? null,
      input.template,
      input.source ?? "curated",
      input.quality_score ?? 0.5,
    ],
  );
  return result.rows[0];
}

export async function patchTranslation(
  id: string,
  patch: PatchTranslationInput,
): Promise<LiteracyTranslation | null> {
  if (patch.template !== undefined && patch.template.trim().length === 0) {
    throw new LiteracyValidationError("template", "template cannot be blank");
  }
  if (patch.source !== undefined && !LITERACY_SOURCES.includes(patch.source)) {
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
    throw new Error("patchTranslation requires DATABASE_URL");
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
    const result = await query<LiteracyTranslation>(
      `SELECT id, metric_id, role, context, template, source,
              quality_score::float AS quality_score, created_at
         FROM literacy_translations WHERE id = $1`,
      [id],
    );
    return result.rows[0] ?? null;
  }
  params.push(id);
  const result = await query<LiteracyTranslation>(
    `UPDATE literacy_translations SET ${sets.join(", ")}
      WHERE id = $${params.length}
      RETURNING id, metric_id, role, context, template, source,
                quality_score::float AS quality_score, created_at`,
    params,
  );
  return result.rows[0] ?? null;
}

export async function deleteTranslation(id: string): Promise<boolean> {
  if (!process.env.DATABASE_URL) {
    throw new Error("deleteTranslation requires DATABASE_URL");
  }
  const { query } = await import("@/lib/db");
  const result = await query(
    `DELETE FROM literacy_translations WHERE id = $1 RETURNING id`,
    [id],
  );
  return result.rows.length > 0;
}
