/**
 * Outcomes — per-dealer feedback loop tracking.
 *
 * Every time a translation gets rendered on a dealer surface or an action
 * recommendation gets emitted, callers should write a row here so the
 * literacy engine can learn which entries actually move the needle.
 *
 * This is the ONLY table in the literacy-ontology family that is keyed on
 * dealer_id. The migration enables strict RLS keyed on
 * app.current_dealer_id; callers must call setTenantContext() before
 * reading outcomes from a tenant-scoped path.
 */

import type { LiteracyOutcome, RecordOutcomeInput } from "./types";
import { LiteracyValidationError } from "./concepts";

/* ------------------------------------------------------------------ */
/*  Validation                                                          */
/* ------------------------------------------------------------------ */

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function validateRecord(input: RecordOutcomeInput): void {
  if (!input.dealer_id || !UUID_PATTERN.test(input.dealer_id)) {
    throw new LiteracyValidationError("dealer_id", "dealer_id (UUID) is required");
  }
  if (!input.translation_id && !input.action_id) {
    throw new LiteracyValidationError(
      "translation_id|action_id",
      "at least one of translation_id, action_id is required",
    );
  }
}

/* ------------------------------------------------------------------ */
/*  Writes                                                              */
/* ------------------------------------------------------------------ */

export async function recordOutcome(input: RecordOutcomeInput): Promise<LiteracyOutcome> {
  validateRecord(input);
  if (!process.env.DATABASE_URL) {
    throw new Error("recordOutcome requires DATABASE_URL");
  }
  const { query } = await import("@/lib/db");
  const result = await query<LiteracyOutcome>(
    `INSERT INTO literacy_outcomes
       (dealer_id, translation_id, action_id, rendered_at, was_clicked,
        was_acted_on, metric_delta)
     VALUES ($1, $2, $3, COALESCE($4::timestamptz, NOW()), $5, $6, $7)
     RETURNING id, dealer_id, translation_id, action_id, rendered_at,
               was_clicked, was_acted_on, metric_delta::float AS metric_delta,
               recorded_at`,
    [
      input.dealer_id,
      input.translation_id ?? null,
      input.action_id ?? null,
      input.rendered_at ?? null,
      input.was_clicked ?? null,
      input.was_acted_on ?? null,
      input.metric_delta ?? null,
    ],
  );
  return result.rows[0];
}

/* ------------------------------------------------------------------ */
/*  Reads                                                               */
/* ------------------------------------------------------------------ */

export async function listOutcomes(opts: {
  dealer_id: string;
  translation_id?: string;
  action_id?: string;
  limit?: number;
}): Promise<LiteracyOutcome[]> {
  if (!process.env.DATABASE_URL) return [];
  if (!UUID_PATTERN.test(opts.dealer_id)) {
    throw new LiteracyValidationError("dealer_id", "dealer_id (UUID) is required");
  }
  const { query } = await import("@/lib/db");
  const where: string[] = ["dealer_id = $1"];
  const params: unknown[] = [opts.dealer_id];
  if (opts.translation_id) {
    params.push(opts.translation_id);
    where.push(`translation_id = $${params.length}`);
  }
  if (opts.action_id) {
    params.push(opts.action_id);
    where.push(`action_id = $${params.length}`);
  }
  const sql = `
    SELECT id, dealer_id, translation_id, action_id, rendered_at,
           was_clicked, was_acted_on, metric_delta::float AS metric_delta,
           recorded_at
      FROM literacy_outcomes
     WHERE ${where.join(" AND ")}
     ORDER BY recorded_at DESC
     LIMIT ${Math.min(Math.max(opts.limit ?? 200, 1), 1000)}
  `;
  const result = await query<LiteracyOutcome>(sql, params);
  return result.rows;
}

/**
 * Aggregate the quality signal for a single translation across all dealers.
 * Used by the (year-two) learning loop to demote low-performing translations
 * and promote high-performing ones.
 */
export async function getTranslationQualitySignal(
  translationId: string,
): Promise<{ rendered: number; clicked: number; acted_on: number }> {
  if (!process.env.DATABASE_URL) {
    return { rendered: 0, clicked: 0, acted_on: 0 };
  }
  const { query } = await import("@/lib/db");
  const result = await query<{ rendered: number; clicked: number; acted_on: number }>(
    `SELECT
       COUNT(*)::int AS rendered,
       COUNT(*) FILTER (WHERE was_clicked = true)::int AS clicked,
       COUNT(*) FILTER (WHERE was_acted_on = true)::int AS acted_on
       FROM literacy_outcomes
      WHERE translation_id = $1`,
    [translationId],
  );
  return result.rows[0] ?? { rendered: 0, clicked: 0, acted_on: 0 };
}
