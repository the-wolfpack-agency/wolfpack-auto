/**
 * Walkthroughs CRUD — multi-step guided tours backed by literacy_walkthroughs
 * (migration 076).
 *
 * Walkthroughs are SHARED ACROSS DEALERS (curated content, role-scoped) so
 * there is no dealer_id column. Per-dealer outcome data lives in
 * literacy_outcomes (migration 075). The write gate is requireWolfpackStaff
 * at the route layer.
 *
 * Mutating helpers fan out to Neo4j as :Walkthrough nodes connected to the
 * :Concept and :Translation nodes that migration 075 already maintains.
 *
 * All functions skip DB work when DATABASE_URL is unset (shadow / test mode)
 * and return either empty results or throw a typed error.
 */

import { LITERACY_ROLES, SLUG_PATTERN } from "@/lib/literacy-ontology";
import { LiteracyValidationError } from "@/lib/literacy-ontology";
import type { LiteracyRole, LiteracySource } from "@/lib/literacy-ontology";

/* ------------------------------------------------------------------ */
/*  Types                                                               */
/* ------------------------------------------------------------------ */

/** Trigger conditions for auto-launching a walkthrough on a surface. */
export type WalkthroughTrigger = "first_login" | "first_visit" | "manual";

export const WALKTHROUGH_TRIGGERS: readonly WalkthroughTrigger[] = [
  "first_login",
  "first_visit",
  "manual",
] as const;

/** One step in a walkthrough. Either references an ontology row OR carries
 *  its own template. The renderer prefers the ontology link if present. */
export interface WalkthroughStep {
  /** CSS / data-testid selector the renderer should anchor against. */
  selector: string;
  /** Optional FK back to a curated concept. */
  concept_id?: string | null;
  /** Optional FK back to a curated translation. */
  translation_id?: string | null;
  /** Inline template (used when no translation_id is provided, or as a
   *  fallback for the renderer). Supports `{value}` / `{metric}` placeholders
   *  the same way migration 075's renderTemplate does. */
  template: string;
  /** Popover anchor direction relative to the selector. */
  position?: "top" | "bottom" | "left" | "right";
}

export interface LiteracyWalkthrough {
  id: string;
  slug: string;
  name: string;
  role: LiteracyRole;
  surface: string | null;
  trigger_condition: WalkthroughTrigger | null;
  steps: WalkthroughStep[];
  source: LiteracySource;
  quality_score: number;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateWalkthroughInput {
  slug: string;
  name: string;
  role: LiteracyRole;
  surface?: string | null;
  trigger_condition?: WalkthroughTrigger | null;
  steps: WalkthroughStep[];
  source?: LiteracySource;
  quality_score?: number;
  active?: boolean;
}

export interface PatchWalkthroughInput {
  name?: string;
  role?: LiteracyRole;
  surface?: string | null;
  trigger_condition?: WalkthroughTrigger | null;
  steps?: WalkthroughStep[];
  source?: LiteracySource;
  quality_score?: number;
  active?: boolean;
}

/* ------------------------------------------------------------------ */
/*  Validation                                                          */
/* ------------------------------------------------------------------ */

/**
 * Validate a walkthrough step. Used at create + patch time and exposed so
 * the unit-test layer can exercise step-by-step rules directly.
 */
export function validateStep(step: unknown, index: number): WalkthroughStep {
  if (!step || typeof step !== "object") {
    throw new LiteracyValidationError(
      `steps[${index}]`,
      "step must be an object",
    );
  }
  const s = step as Record<string, unknown>;
  if (typeof s.selector !== "string" || s.selector.trim().length === 0) {
    throw new LiteracyValidationError(
      `steps[${index}].selector`,
      "selector must be a non-empty string",
    );
  }
  if (typeof s.template !== "string" || s.template.trim().length === 0) {
    throw new LiteracyValidationError(
      `steps[${index}].template`,
      "template must be a non-empty string",
    );
  }
  if (
    s.position !== undefined &&
    s.position !== null &&
    !["top", "bottom", "left", "right"].includes(String(s.position))
  ) {
    throw new LiteracyValidationError(
      `steps[${index}].position`,
      `position must be one of top|bottom|left|right (got ${String(s.position)})`,
    );
  }
  return {
    selector: s.selector,
    concept_id: (s.concept_id as string | null | undefined) ?? null,
    translation_id: (s.translation_id as string | null | undefined) ?? null,
    template: s.template,
    position: s.position as WalkthroughStep["position"] | undefined,
  };
}

function validateCreate(input: CreateWalkthroughInput): void {
  if (!input.slug || !SLUG_PATTERN.test(input.slug)) {
    throw new LiteracyValidationError(
      "slug",
      `slug must match ${SLUG_PATTERN.source} (got: ${JSON.stringify(input.slug)})`,
    );
  }
  if (!input.name || input.name.trim().length === 0) {
    throw new LiteracyValidationError("name", "name is required");
  }
  if (!LITERACY_ROLES.includes(input.role)) {
    throw new LiteracyValidationError("role", `invalid role: ${input.role}`);
  }
  if (!Array.isArray(input.steps) || input.steps.length === 0) {
    throw new LiteracyValidationError(
      "steps",
      "steps must be a non-empty array",
    );
  }
  input.steps.forEach((s, i) => validateStep(s, i));
  if (
    input.trigger_condition !== undefined &&
    input.trigger_condition !== null &&
    !WALKTHROUGH_TRIGGERS.includes(input.trigger_condition)
  ) {
    throw new LiteracyValidationError(
      "trigger_condition",
      `trigger_condition must be one of ${WALKTHROUGH_TRIGGERS.join(", ")}`,
    );
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
/*  Neo4j fan-out (:Walkthrough nodes connected to :Concept / :Translation) */
/* ------------------------------------------------------------------ */

async function fanOutWalkthroughToNeo4j(
  walkthrough: LiteracyWalkthrough,
): Promise<void> {
  const neo4jUrl = process.env.NEO4J_URI || process.env.NEO4J_URL;
  if (!neo4jUrl) return;

  try {
    const { executeNeo4jQueries } = await import("@/lib/neo4j-client");
    const statements: Array<{
      statement: string;
      parameters: Record<string, unknown>;
    }> = [
      {
        statement: `
          MERGE (w:Walkthrough {id: $id})
          SET w.slug = $slug,
              w.name = $name,
              w.role = $role,
              w.surface = $surface,
              w.trigger_condition = $trigger,
              w.source = $source,
              w.quality_score = $quality,
              w.active = $active,
              w.updated_at = datetime($updatedAt)
        `,
        parameters: {
          id: walkthrough.id,
          slug: walkthrough.slug,
          name: walkthrough.name,
          role: walkthrough.role,
          surface: walkthrough.surface ?? "",
          trigger: walkthrough.trigger_condition ?? "",
          source: walkthrough.source,
          quality: walkthrough.quality_score,
          active: walkthrough.active,
          updatedAt: walkthrough.updated_at,
        },
      },
    ];

    // Drop stale STEP_OF edges, then re-add for the current step list.
    statements.push({
      statement: `MATCH (w:Walkthrough {id: $id})-[r:STEP_OF]->() DELETE r`,
      parameters: { id: walkthrough.id },
    });

    walkthrough.steps.forEach((step, idx) => {
      if (step.concept_id) {
        statements.push({
          statement: `
            MATCH (w:Walkthrough {id: $wId})
            MATCH (c:Concept     {id: $cId})
            MERGE (w)-[r:STEP_OF {index: $idx}]->(c)
          `,
          parameters: { wId: walkthrough.id, cId: step.concept_id, idx },
        });
      }
      if (step.translation_id) {
        statements.push({
          statement: `
            MATCH (w:Walkthrough  {id: $wId})
            MATCH (t:Translation  {id: $tId})
            MERGE (w)-[r:STEP_OF {index: $idx}]->(t)
          `,
          parameters: { wId: walkthrough.id, tId: step.translation_id, idx },
        });
      }
    });

    await executeNeo4jQueries(statements);
  } catch (err) {
    console.warn(
      "[literacy-walkthroughs] Neo4j walkthrough fan-out failed (non-blocking):",
      err instanceof Error ? err.message : String(err),
    );
  }
}

async function deleteWalkthroughFromNeo4j(id: string): Promise<void> {
  const neo4jUrl = process.env.NEO4J_URI || process.env.NEO4J_URL;
  if (!neo4jUrl) return;
  try {
    const { executeNeo4jQueries } = await import("@/lib/neo4j-client");
    await executeNeo4jQueries([
      {
        statement: `MATCH (w:Walkthrough {id: $id}) DETACH DELETE w`,
        parameters: { id },
      },
    ]);
  } catch (err) {
    console.warn(
      "[literacy-walkthroughs] Neo4j walkthrough delete fan-out failed (non-blocking):",
      err instanceof Error ? err.message : String(err),
    );
  }
}

/* ------------------------------------------------------------------ */
/*  Row hydration                                                       */
/* ------------------------------------------------------------------ */

interface WalkthroughRow {
  id: string;
  slug: string;
  name: string;
  role: LiteracyRole;
  surface: string | null;
  trigger_condition: WalkthroughTrigger | null;
  steps: WalkthroughStep[] | string;
  source: LiteracySource;
  quality_score: number;
  active: boolean;
  created_at: string;
  updated_at: string;
}

function hydrate(row: WalkthroughRow): LiteracyWalkthrough {
  let steps: WalkthroughStep[];
  if (typeof row.steps === "string") {
    try {
      steps = JSON.parse(row.steps) as WalkthroughStep[];
    } catch {
      steps = [];
    }
  } else {
    steps = row.steps ?? [];
  }
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    role: row.role,
    surface: row.surface,
    trigger_condition: row.trigger_condition,
    steps,
    source: row.source,
    quality_score: row.quality_score,
    active: row.active,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/* ------------------------------------------------------------------ */
/*  Reads                                                               */
/* ------------------------------------------------------------------ */

export async function listWalkthroughs(opts: {
  role?: LiteracyRole;
  surface?: string;
  active?: boolean;
  limit?: number;
} = {}): Promise<LiteracyWalkthrough[]> {
  if (!process.env.DATABASE_URL) return [];
  const { query } = await import("@/lib/db");
  const where: string[] = [];
  const params: unknown[] = [];
  if (opts.role) {
    params.push(opts.role);
    where.push(`role = $${params.length}`);
  }
  if (opts.surface) {
    params.push(opts.surface);
    where.push(`surface = $${params.length}`);
  }
  if (opts.active !== undefined) {
    params.push(opts.active);
    where.push(`active = $${params.length}`);
  }
  const sql = `
    SELECT id, slug, name, role, surface, trigger_condition, steps,
           source, quality_score::float AS quality_score, active,
           created_at, updated_at
      FROM literacy_walkthroughs
      ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
      ORDER BY role, slug
      LIMIT ${Math.min(Math.max(opts.limit ?? 200, 1), 1000)}
  `;
  const result = await query<WalkthroughRow>(sql, params);
  return result.rows.map(hydrate);
}

export async function getWalkthroughBySlug(
  slug: string,
): Promise<LiteracyWalkthrough | null> {
  if (!process.env.DATABASE_URL) return null;
  const { query } = await import("@/lib/db");
  const result = await query<WalkthroughRow>(
    `SELECT id, slug, name, role, surface, trigger_condition, steps,
            source, quality_score::float AS quality_score, active,
            created_at, updated_at
       FROM literacy_walkthroughs
      WHERE slug = $1
      LIMIT 1`,
    [slug],
  );
  return result.rows[0] ? hydrate(result.rows[0]) : null;
}

export async function getWalkthroughById(
  id: string,
): Promise<LiteracyWalkthrough | null> {
  if (!process.env.DATABASE_URL) return null;
  const { query } = await import("@/lib/db");
  const result = await query<WalkthroughRow>(
    `SELECT id, slug, name, role, surface, trigger_condition, steps,
            source, quality_score::float AS quality_score, active,
            created_at, updated_at
       FROM literacy_walkthroughs
      WHERE id = $1
      LIMIT 1`,
    [id],
  );
  return result.rows[0] ? hydrate(result.rows[0]) : null;
}

/**
 * Role-aware fetch for the public route. Falls back to role='any' so every
 * concept_slug has at least one walkthrough when one is curated.
 *
 * Returns the first active walkthrough that targets the requested surface
 * for the requested role, preferring exact role matches over `any`.
 */
export async function getWalkthroughForRole(
  slug: string,
  role: LiteracyRole,
): Promise<LiteracyWalkthrough | null> {
  if (!process.env.DATABASE_URL) return null;
  const { query } = await import("@/lib/db");
  const result = await query<WalkthroughRow>(
    `SELECT id, slug, name, role, surface, trigger_condition, steps,
            source, quality_score::float AS quality_score, active,
            created_at, updated_at
       FROM literacy_walkthroughs
      WHERE slug = $1
        AND active = TRUE
        AND (role = $2 OR role = 'any')
      ORDER BY
        (role = $2) DESC,
        quality_score DESC,
        updated_at DESC
      LIMIT 1`,
    [slug, role],
  );
  return result.rows[0] ? hydrate(result.rows[0]) : null;
}

/* ------------------------------------------------------------------ */
/*  Writes                                                              */
/* ------------------------------------------------------------------ */

export async function createWalkthrough(
  input: CreateWalkthroughInput,
): Promise<LiteracyWalkthrough> {
  validateCreate(input);
  if (!process.env.DATABASE_URL) {
    throw new Error("createWalkthrough requires DATABASE_URL");
  }
  const { query } = await import("@/lib/db");

  // Pre-flight slug uniqueness for a typed error rather than raw 23505.
  const dupe = await query(
    `SELECT 1 FROM literacy_walkthroughs WHERE slug = $1 LIMIT 1`,
    [input.slug],
  );
  if (dupe.rows.length > 0) {
    throw new LiteracyValidationError(
      "slug",
      `slug already exists: ${input.slug}`,
    );
  }

  const steps = input.steps.map((s, i) => validateStep(s, i));
  const result = await query<WalkthroughRow>(
    `INSERT INTO literacy_walkthroughs
       (slug, name, role, surface, trigger_condition, steps, source,
        quality_score, active)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9)
     RETURNING id, slug, name, role, surface, trigger_condition, steps,
               source, quality_score::float AS quality_score, active,
               created_at, updated_at`,
    [
      input.slug,
      input.name,
      input.role,
      input.surface ?? null,
      input.trigger_condition ?? null,
      JSON.stringify(steps),
      input.source ?? "ai_proposed",
      input.quality_score ?? 0.5,
      input.active ?? true,
    ],
  );
  const walkthrough = hydrate(result.rows[0]);
  await fanOutWalkthroughToNeo4j(walkthrough);
  return walkthrough;
}

export async function patchWalkthrough(
  id: string,
  patch: PatchWalkthroughInput,
): Promise<LiteracyWalkthrough | null> {
  if (patch.role !== undefined && !LITERACY_ROLES.includes(patch.role)) {
    throw new LiteracyValidationError("role", `invalid role: ${patch.role}`);
  }
  if (
    patch.trigger_condition !== undefined &&
    patch.trigger_condition !== null &&
    !WALKTHROUGH_TRIGGERS.includes(patch.trigger_condition)
  ) {
    throw new LiteracyValidationError(
      "trigger_condition",
      `invalid trigger_condition: ${patch.trigger_condition}`,
    );
  }
  if (patch.steps !== undefined) {
    if (!Array.isArray(patch.steps) || patch.steps.length === 0) {
      throw new LiteracyValidationError(
        "steps",
        "steps must be a non-empty array",
      );
    }
    patch.steps.forEach((s, i) => validateStep(s, i));
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
    throw new Error("patchWalkthrough requires DATABASE_URL");
  }
  const { query } = await import("@/lib/db");

  const sets: string[] = [];
  const params: unknown[] = [];
  const push = (col: string, val: unknown) => {
    params.push(val);
    sets.push(`${col} = $${params.length}`);
  };
  if (patch.name !== undefined) push("name", patch.name);
  if (patch.role !== undefined) push("role", patch.role);
  if (patch.surface !== undefined) push("surface", patch.surface);
  if (patch.trigger_condition !== undefined)
    push("trigger_condition", patch.trigger_condition);
  if (patch.steps !== undefined) {
    params.push(JSON.stringify(patch.steps));
    sets.push(`steps = $${params.length}::jsonb`);
  }
  if (patch.source !== undefined) push("source", patch.source);
  if (patch.quality_score !== undefined)
    push("quality_score", patch.quality_score);
  if (patch.active !== undefined) push("active", patch.active);

  if (sets.length === 0) {
    return getWalkthroughById(id);
  }
  params.push(id);
  const result = await query<WalkthroughRow>(
    `UPDATE literacy_walkthroughs
        SET ${sets.join(", ")}, updated_at = NOW()
      WHERE id = $${params.length}
      RETURNING id, slug, name, role, surface, trigger_condition, steps,
                source, quality_score::float AS quality_score, active,
                created_at, updated_at`,
    params,
  );
  if (!result.rows[0]) return null;
  const walkthrough = hydrate(result.rows[0]);
  await fanOutWalkthroughToNeo4j(walkthrough);
  return walkthrough;
}

export async function deleteWalkthrough(id: string): Promise<boolean> {
  if (!process.env.DATABASE_URL) {
    throw new Error("deleteWalkthrough requires DATABASE_URL");
  }
  const { query } = await import("@/lib/db");
  const result = await query(
    `DELETE FROM literacy_walkthroughs WHERE id = $1 RETURNING id`,
    [id],
  );
  const deleted = result.rows.length > 0;
  if (deleted) await deleteWalkthroughFromNeo4j(id);
  return deleted;
}
