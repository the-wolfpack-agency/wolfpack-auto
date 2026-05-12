/**
 * Actions CRUD — recommended interventions tied to (metric, role, trigger).
 *
 * An action is the "what should I do about it" half of the ontology.
 * The trigger_condition is free-text today ("below_benchmark",
 * "declining_trend_3mo", "top_decile") — the analytics layer that fires
 * actions interprets it. We don't enforce a fixed enum because triggers
 * are dealer-context-dependent (e.g. "below 30% for >2 months").
 */

import type {
  CreateActionInput,
  LiteracyAction,
  LiteracyActionRole,
  PatchActionInput,
} from "./types";
import {
  LITERACY_ACTION_ROLES,
  LITERACY_SOURCES,
} from "./types";
import { LiteracyValidationError } from "./concepts";
import { renderTemplate } from "./translations";

/* ------------------------------------------------------------------ */
/*  Validation                                                          */
/* ------------------------------------------------------------------ */

function validateCreate(input: CreateActionInput): void {
  if (!input.metric_id) {
    throw new LiteracyValidationError("metric_id", "metric_id is required");
  }
  if (!LITERACY_ACTION_ROLES.includes(input.role)) {
    throw new LiteracyValidationError("role", `invalid role: ${input.role}`);
  }
  if (!input.trigger_condition || input.trigger_condition.trim().length === 0) {
    throw new LiteracyValidationError(
      "trigger_condition",
      "trigger_condition is required",
    );
  }
  if (
    !input.recommendation_template ||
    input.recommendation_template.trim().length === 0
  ) {
    throw new LiteracyValidationError(
      "recommendation_template",
      "recommendation_template is required",
    );
  }
  if (input.source !== undefined && !LITERACY_SOURCES.includes(input.source)) {
    throw new LiteracyValidationError("source", `invalid source: ${input.source}`);
  }
}

/* ------------------------------------------------------------------ */
/*  Reads                                                               */
/* ------------------------------------------------------------------ */

export async function listActions(opts: {
  metric_id?: string;
  role?: LiteracyActionRole;
  trigger_condition?: string;
  limit?: number;
} = {}): Promise<LiteracyAction[]> {
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
  if (opts.trigger_condition) {
    params.push(opts.trigger_condition);
    where.push(`trigger_condition = $${params.length}`);
  }
  const sql = `
    SELECT id, metric_id, trigger_condition, role, recommendation_template,
           expected_outcome, source, created_at
      FROM literacy_actions
      ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
      ORDER BY role, trigger_condition
      LIMIT ${Math.min(Math.max(opts.limit ?? 200, 1), 1000)}
  `;
  const result = await query<LiteracyAction>(sql, params);
  return result.rows;
}

/**
 * Look up + render an action recommendation. Returns null when no action
 * matches the trigger for that (metric, role) combination.
 */
export async function recommendAction(
  metricId: string,
  role: LiteracyActionRole,
  trigger: string,
  variables: Record<string, string | number | null | undefined> = {},
): Promise<{ rendered: string; action: LiteracyAction } | null> {
  if (!process.env.DATABASE_URL) return null;
  const { query } = await import("@/lib/db");
  const result = await query<LiteracyAction>(
    `SELECT id, metric_id, trigger_condition, role, recommendation_template,
            expected_outcome, source, created_at
       FROM literacy_actions
      WHERE metric_id = $1 AND role = $2 AND trigger_condition = $3
      LIMIT 1`,
    [metricId, role, trigger],
  );
  const action = result.rows[0];
  if (!action) return null;
  const rendered = renderTemplate(action.recommendation_template, variables);
  return { rendered, action };
}

/* ------------------------------------------------------------------ */
/*  Writes                                                              */
/* ------------------------------------------------------------------ */

export async function createAction(input: CreateActionInput): Promise<LiteracyAction> {
  validateCreate(input);
  if (!process.env.DATABASE_URL) throw new Error("createAction requires DATABASE_URL");
  const { query } = await import("@/lib/db");
  const result = await query<LiteracyAction>(
    `INSERT INTO literacy_actions
       (metric_id, trigger_condition, role, recommendation_template,
        expected_outcome, source)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, metric_id, trigger_condition, role, recommendation_template,
               expected_outcome, source, created_at`,
    [
      input.metric_id,
      input.trigger_condition,
      input.role,
      input.recommendation_template,
      input.expected_outcome ?? null,
      input.source ?? "curated",
    ],
  );
  return result.rows[0];
}

/** Upsert keyed on (metric, role, trigger) for seed idempotence. */
export async function upsertAction(input: CreateActionInput): Promise<LiteracyAction> {
  validateCreate(input);
  if (!process.env.DATABASE_URL) {
    throw new Error("upsertAction requires DATABASE_URL");
  }
  const { query } = await import("@/lib/db");
  const result = await query<LiteracyAction>(
    `INSERT INTO literacy_actions
       (metric_id, trigger_condition, role, recommendation_template,
        expected_outcome, source)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (metric_id, role, trigger_condition) DO UPDATE
       SET recommendation_template = EXCLUDED.recommendation_template,
           expected_outcome = EXCLUDED.expected_outcome,
           source = EXCLUDED.source
     RETURNING id, metric_id, trigger_condition, role, recommendation_template,
               expected_outcome, source, created_at`,
    [
      input.metric_id,
      input.trigger_condition,
      input.role,
      input.recommendation_template,
      input.expected_outcome ?? null,
      input.source ?? "curated",
    ],
  );
  return result.rows[0];
}

export async function patchAction(
  id: string,
  patch: PatchActionInput,
): Promise<LiteracyAction | null> {
  if (
    patch.recommendation_template !== undefined &&
    patch.recommendation_template.trim().length === 0
  ) {
    throw new LiteracyValidationError(
      "recommendation_template",
      "recommendation_template cannot be blank",
    );
  }
  if (patch.source !== undefined && !LITERACY_SOURCES.includes(patch.source)) {
    throw new LiteracyValidationError("source", `invalid source: ${patch.source}`);
  }
  if (!process.env.DATABASE_URL) throw new Error("patchAction requires DATABASE_URL");
  const { query } = await import("@/lib/db");
  const sets: string[] = [];
  const params: unknown[] = [];
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    params.push(value);
    sets.push(`${key} = $${params.length}`);
  }
  if (sets.length === 0) {
    const result = await query<LiteracyAction>(
      `SELECT id, metric_id, trigger_condition, role, recommendation_template,
              expected_outcome, source, created_at
         FROM literacy_actions WHERE id = $1`,
      [id],
    );
    return result.rows[0] ?? null;
  }
  params.push(id);
  const result = await query<LiteracyAction>(
    `UPDATE literacy_actions SET ${sets.join(", ")}
      WHERE id = $${params.length}
      RETURNING id, metric_id, trigger_condition, role, recommendation_template,
                expected_outcome, source, created_at`,
    params,
  );
  return result.rows[0] ?? null;
}

export async function deleteAction(id: string): Promise<boolean> {
  if (!process.env.DATABASE_URL) throw new Error("deleteAction requires DATABASE_URL");
  const { query } = await import("@/lib/db");
  const result = await query(
    `DELETE FROM literacy_actions WHERE id = $1 RETURNING id`,
    [id],
  );
  return result.rows.length > 0;
}
