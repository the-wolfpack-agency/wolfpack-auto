/**
 * Action Registry — CRUD over the assistant_actions table.
 *
 * The action registry is agency-shared curated metadata. Every action the
 * assistant can take is registered here with:
 *   - A canonical slug (e.g. "leads.update_routing_rule")
 *   - A natural-language description (for LLM mapping later)
 *   - A JSON Schema describing required parameters
 *   - A role allowlist controlling who can invoke
 *   - A side-effect class (read/mutating/irreversible)
 *   - Whether dry-run is supported
 *
 * Mutating helpers are gated at the route layer to requireWolfpackStaff. This
 * library does NOT enforce that — it's the SQL/persistence layer. Routes are
 * the gate.
 *
 * All functions skip DB work when DATABASE_URL is unset (shadow / test mode)
 * and return either deterministic stubs or empty results.
 */

import type {
  AssistantAction,
  AssistantCategory,
  AssistantRole,
  AssistantSideEffect,
  CreateActionInput,
  PatchActionInput,
} from "./types";
import {
  ASSISTANT_CATEGORIES,
  ASSISTANT_ROLES,
  ASSISTANT_SIDE_EFFECTS,
  ASSISTANT_SLUG_PATTERN,
} from "./types";

/* ------------------------------------------------------------------ */
/*  Validation                                                          */
/* ------------------------------------------------------------------ */

export class AssistantValidationError extends Error {
  constructor(public readonly field: string, message: string) {
    super(message);
    this.name = "AssistantValidationError";
  }
}

function validateCreate(input: CreateActionInput): void {
  if (!input.slug || !ASSISTANT_SLUG_PATTERN.test(input.slug)) {
    throw new AssistantValidationError(
      "slug",
      `slug must match ${ASSISTANT_SLUG_PATTERN.source} (got: ${JSON.stringify(input.slug)})`,
    );
  }
  if (!input.display_name || input.display_name.trim().length === 0) {
    throw new AssistantValidationError("display_name", "display_name is required");
  }
  if (!input.description || input.description.trim().length === 0) {
    throw new AssistantValidationError("description", "description is required");
  }
  if (!input.parameter_schema || typeof input.parameter_schema !== "object") {
    throw new AssistantValidationError(
      "parameter_schema",
      "parameter_schema must be an object (JSON Schema-shaped)",
    );
  }
  if (!Array.isArray(input.allowed_roles) || input.allowed_roles.length === 0) {
    throw new AssistantValidationError(
      "allowed_roles",
      "allowed_roles must be a non-empty array",
    );
  }
  for (const role of input.allowed_roles) {
    if (!ASSISTANT_ROLES.includes(role)) {
      throw new AssistantValidationError(
        "allowed_roles",
        `unknown role: ${role}`,
      );
    }
  }
  if (!ASSISTANT_SIDE_EFFECTS.includes(input.side_effect)) {
    throw new AssistantValidationError(
      "side_effect",
      `side_effect must be one of ${ASSISTANT_SIDE_EFFECTS.join(", ")}`,
    );
  }
  if (input.category && !ASSISTANT_CATEGORIES.includes(input.category)) {
    throw new AssistantValidationError(
      "category",
      `unknown category: ${input.category}`,
    );
  }
}

function validatePatch(patch: PatchActionInput): void {
  if (patch.display_name !== undefined && patch.display_name.trim().length === 0) {
    throw new AssistantValidationError("display_name", "display_name cannot be blank");
  }
  if (patch.description !== undefined && patch.description.trim().length === 0) {
    throw new AssistantValidationError("description", "description cannot be blank");
  }
  if (patch.side_effect !== undefined && !ASSISTANT_SIDE_EFFECTS.includes(patch.side_effect)) {
    throw new AssistantValidationError("side_effect", `unknown side_effect: ${patch.side_effect}`);
  }
  if (patch.category !== undefined && patch.category !== null && !ASSISTANT_CATEGORIES.includes(patch.category)) {
    throw new AssistantValidationError("category", `unknown category: ${patch.category}`);
  }
  if (patch.allowed_roles !== undefined) {
    if (!Array.isArray(patch.allowed_roles) || patch.allowed_roles.length === 0) {
      throw new AssistantValidationError("allowed_roles", "allowed_roles must be a non-empty array");
    }
    for (const role of patch.allowed_roles) {
      if (!ASSISTANT_ROLES.includes(role)) {
        throw new AssistantValidationError("allowed_roles", `unknown role: ${role}`);
      }
    }
  }
}

/* ------------------------------------------------------------------ */
/*  Row mapping                                                         */
/* ------------------------------------------------------------------ */

function mapRow(row: Record<string, unknown>): AssistantAction {
  const allowed = row.allowed_roles;
  const schemaRaw = row.parameter_schema;
  return {
    id: String(row.id),
    slug: String(row.slug),
    display_name: String(row.display_name),
    description: String(row.description),
    parameter_schema:
      typeof schemaRaw === "string"
        ? safeJSON(schemaRaw, {})
        : (schemaRaw as Record<string, unknown>) ?? {},
    allowed_roles: Array.isArray(allowed) ? (allowed as AssistantRole[]) : [],
    side_effect: row.side_effect as AssistantSideEffect,
    dry_run_supported: Boolean(row.dry_run_supported),
    category: (row.category as AssistantCategory | null) ?? null,
    active: Boolean(row.active),
    created_at: String(row.created_at ?? ""),
    updated_at: String(row.updated_at ?? ""),
  };
}

function safeJSON<T>(s: string, fallback: T): T {
  try { return JSON.parse(s) as T; } catch { return fallback; }
}

/* ------------------------------------------------------------------ */
/*  Reads                                                               */
/* ------------------------------------------------------------------ */

export interface ListActionsOptions {
  category?: AssistantCategory;
  side_effect?: AssistantSideEffect;
  active_only?: boolean;
  role?: AssistantRole;
  limit?: number;
}

export async function listActions(
  opts: ListActionsOptions = {},
): Promise<AssistantAction[]> {
  if (!process.env.DATABASE_URL) return [];
  const { query } = await import("@/lib/db");

  const where: string[] = [];
  const params: unknown[] = [];
  if (opts.category) {
    params.push(opts.category);
    where.push(`category = $${params.length}`);
  }
  if (opts.side_effect) {
    params.push(opts.side_effect);
    where.push(`side_effect = $${params.length}`);
  }
  if (opts.active_only) {
    where.push(`active = TRUE`);
  }
  if (opts.role) {
    params.push(opts.role);
    where.push(`($${params.length} = ANY(allowed_roles) OR 'any' = ANY(allowed_roles))`);
  }

  const limit = Math.min(Math.max(opts.limit ?? 200, 1), 1000);
  const sql = `
    SELECT id, slug, display_name, description, parameter_schema, allowed_roles,
           side_effect, dry_run_supported, category, active, created_at, updated_at
      FROM assistant_actions
      ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
      ORDER BY slug
      LIMIT ${limit}
  `;
  const result = await query<Record<string, unknown>>(sql, params);
  return result.rows.map(mapRow);
}

export async function getActionBySlug(slug: string): Promise<AssistantAction | null> {
  if (!process.env.DATABASE_URL) return null;
  const { query } = await import("@/lib/db");
  const result = await query<Record<string, unknown>>(
    `SELECT id, slug, display_name, description, parameter_schema, allowed_roles,
            side_effect, dry_run_supported, category, active, created_at, updated_at
       FROM assistant_actions WHERE slug = $1 LIMIT 1`,
    [slug],
  );
  return result.rows[0] ? mapRow(result.rows[0]) : null;
}

export async function getActionById(id: string): Promise<AssistantAction | null> {
  if (!process.env.DATABASE_URL) return null;
  const { query } = await import("@/lib/db");
  const result = await query<Record<string, unknown>>(
    `SELECT id, slug, display_name, description, parameter_schema, allowed_roles,
            side_effect, dry_run_supported, category, active, created_at, updated_at
       FROM assistant_actions WHERE id = $1 LIMIT 1`,
    [id],
  );
  return result.rows[0] ? mapRow(result.rows[0]) : null;
}

/* ------------------------------------------------------------------ */
/*  Writes                                                              */
/* ------------------------------------------------------------------ */

/**
 * Create a new action. Slug must be unique — duplicates raise an
 * AssistantValidationError instead of a raw 23505.
 */
export async function createAction(
  input: CreateActionInput,
): Promise<AssistantAction> {
  validateCreate(input);

  if (!process.env.DATABASE_URL) {
    throw new Error("createAction requires DATABASE_URL");
  }
  const { query } = await import("@/lib/db");

  const dupe = await query(
    `SELECT 1 FROM assistant_actions WHERE slug = $1 LIMIT 1`,
    [input.slug],
  );
  if (dupe.rows.length > 0) {
    throw new AssistantValidationError("slug", `slug already exists: ${input.slug}`);
  }

  const result = await query<Record<string, unknown>>(
    `INSERT INTO assistant_actions
       (slug, display_name, description, parameter_schema, allowed_roles,
        side_effect, dry_run_supported, category, active)
     VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, $8, $9)
     RETURNING id, slug, display_name, description, parameter_schema, allowed_roles,
               side_effect, dry_run_supported, category, active, created_at, updated_at`,
    [
      input.slug,
      input.display_name,
      input.description,
      JSON.stringify(input.parameter_schema),
      input.allowed_roles,
      input.side_effect,
      input.dry_run_supported ?? true,
      input.category ?? null,
      input.active ?? true,
    ],
  );
  return mapRow(result.rows[0]);
}

/**
 * Idempotent upsert by slug. Used by the seed script.
 */
export async function upsertActionBySlug(
  input: CreateActionInput,
): Promise<AssistantAction> {
  validateCreate(input);
  if (!process.env.DATABASE_URL) {
    throw new Error("upsertActionBySlug requires DATABASE_URL");
  }
  const { query } = await import("@/lib/db");
  const result = await query<Record<string, unknown>>(
    `INSERT INTO assistant_actions
       (slug, display_name, description, parameter_schema, allowed_roles,
        side_effect, dry_run_supported, category, active)
     VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, $8, $9)
     ON CONFLICT (slug) DO UPDATE
       SET display_name = EXCLUDED.display_name,
           description = EXCLUDED.description,
           parameter_schema = EXCLUDED.parameter_schema,
           allowed_roles = EXCLUDED.allowed_roles,
           side_effect = EXCLUDED.side_effect,
           dry_run_supported = EXCLUDED.dry_run_supported,
           category = EXCLUDED.category,
           active = EXCLUDED.active,
           updated_at = NOW()
     RETURNING id, slug, display_name, description, parameter_schema, allowed_roles,
               side_effect, dry_run_supported, category, active, created_at, updated_at`,
    [
      input.slug,
      input.display_name,
      input.description,
      JSON.stringify(input.parameter_schema),
      input.allowed_roles,
      input.side_effect,
      input.dry_run_supported ?? true,
      input.category ?? null,
      input.active ?? true,
    ],
  );
  return mapRow(result.rows[0]);
}

export async function patchAction(
  id: string,
  patch: PatchActionInput,
): Promise<AssistantAction | null> {
  validatePatch(patch);
  if (!process.env.DATABASE_URL) {
    throw new Error("patchAction requires DATABASE_URL");
  }
  const { query } = await import("@/lib/db");

  const sets: string[] = [];
  const params: unknown[] = [];
  const push = (col: string, value: unknown, cast?: string) => {
    params.push(value);
    sets.push(`${col} = $${params.length}${cast ? `::${cast}` : ""}`);
  };
  if (patch.display_name !== undefined) push("display_name", patch.display_name);
  if (patch.description !== undefined) push("description", patch.description);
  if (patch.parameter_schema !== undefined) push("parameter_schema", JSON.stringify(patch.parameter_schema), "jsonb");
  if (patch.allowed_roles !== undefined) push("allowed_roles", patch.allowed_roles);
  if (patch.side_effect !== undefined) push("side_effect", patch.side_effect);
  if (patch.dry_run_supported !== undefined) push("dry_run_supported", patch.dry_run_supported);
  if (patch.category !== undefined) push("category", patch.category);
  if (patch.active !== undefined) push("active", patch.active);

  if (sets.length === 0) return getActionById(id);

  params.push(id);
  const result = await query<Record<string, unknown>>(
    `UPDATE assistant_actions
        SET ${sets.join(", ")}, updated_at = NOW()
      WHERE id = $${params.length}
      RETURNING id, slug, display_name, description, parameter_schema, allowed_roles,
                side_effect, dry_run_supported, category, active, created_at, updated_at`,
    params,
  );
  return result.rows[0] ? mapRow(result.rows[0]) : null;
}

export async function deleteAction(id: string): Promise<boolean> {
  if (!process.env.DATABASE_URL) {
    throw new Error("deleteAction requires DATABASE_URL");
  }
  const { query } = await import("@/lib/db");
  const result = await query(
    `DELETE FROM assistant_actions WHERE id = $1 RETURNING id`,
    [id],
  );
  return result.rows.length > 0;
}
