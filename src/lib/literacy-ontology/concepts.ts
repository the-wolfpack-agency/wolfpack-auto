/**
 * Concepts CRUD — digital and physical objects in the literacy ontology.
 *
 * Mutating helpers fan out to Neo4j via `src/lib/triple-write.ts` so the
 * graph store carries a :Concept node for every row. Postgres remains the
 * source of truth.
 *
 * All functions skip DB work when DATABASE_URL is unset (shadow / test mode)
 * and return either deterministic stubs or empty results. Real wiring is
 * exercised by the contract + integration tests with a mocked `query`.
 */

import type {
  ConceptDomain,
  CreateConceptInput,
  LiteracyConcept,
  PatchConceptInput,
} from "./types";
import {
  CONCEPT_DOMAINS,
  SLUG_PATTERN,
} from "./types";

/* ------------------------------------------------------------------ */
/*  Validation                                                          */
/* ------------------------------------------------------------------ */

export class LiteracyValidationError extends Error {
  constructor(public readonly field: string, message: string) {
    super(message);
    this.name = "LiteracyValidationError";
  }
}

function validateCreate(input: CreateConceptInput): void {
  if (!input.slug || !SLUG_PATTERN.test(input.slug)) {
    throw new LiteracyValidationError(
      "slug",
      `slug must match ${SLUG_PATTERN.source} (got: ${JSON.stringify(input.slug)})`,
    );
  }
  if (!input.name || input.name.trim().length === 0) {
    throw new LiteracyValidationError("name", "name is required");
  }
  if (!CONCEPT_DOMAINS.includes(input.domain)) {
    throw new LiteracyValidationError(
      "domain",
      `domain must be one of ${CONCEPT_DOMAINS.join(", ")} (got: ${input.domain})`,
    );
  }
}

/* ------------------------------------------------------------------ */
/*  Neo4j fan-out (graph store is the natural rendering of ontology)   */
/* ------------------------------------------------------------------ */

async function fanOutConceptToNeo4j(concept: LiteracyConcept): Promise<void> {
  const neo4jUrl = process.env.NEO4J_URI || process.env.NEO4J_URL;
  if (!neo4jUrl) return;

  try {
    const { executeNeo4jQueries } = await import("@/lib/neo4j-client");
    await executeNeo4jQueries([
      {
        statement: `
          MERGE (c:Concept {id: $id})
          SET c.slug = $slug,
              c.name = $name,
              c.domain = $domain,
              c.surface = $surface,
              c.description = $description,
              c.updated_at = datetime($updatedAt)
        `,
        parameters: {
          id: concept.id,
          slug: concept.slug,
          name: concept.name,
          domain: concept.domain,
          surface: concept.surface ?? "",
          description: concept.description ?? "",
          updatedAt: concept.updated_at,
        },
      },
    ]);
  } catch (err) {
    console.warn(
      "[literacy-ontology] Neo4j concept fan-out failed (non-blocking):",
      err instanceof Error ? err.message : String(err),
    );
  }
}

async function deleteConceptFromNeo4j(conceptId: string): Promise<void> {
  const neo4jUrl = process.env.NEO4J_URI || process.env.NEO4J_URL;
  if (!neo4jUrl) return;
  try {
    const { executeNeo4jQueries } = await import("@/lib/neo4j-client");
    await executeNeo4jQueries([
      {
        statement: `MATCH (c:Concept {id: $id}) DETACH DELETE c`,
        parameters: { id: conceptId },
      },
    ]);
  } catch (err) {
    console.warn(
      "[literacy-ontology] Neo4j concept delete fan-out failed (non-blocking):",
      err instanceof Error ? err.message : String(err),
    );
  }
}

/* ------------------------------------------------------------------ */
/*  Reads                                                               */
/* ------------------------------------------------------------------ */

export async function listConcepts(opts: {
  domain?: ConceptDomain;
  surface?: string;
  limit?: number;
} = {}): Promise<LiteracyConcept[]> {
  if (!process.env.DATABASE_URL) return [];
  const { query } = await import("@/lib/db");

  const where: string[] = [];
  const params: unknown[] = [];
  if (opts.domain) {
    params.push(opts.domain);
    where.push(`domain = $${params.length}`);
  }
  if (opts.surface) {
    params.push(opts.surface);
    where.push(`surface = $${params.length}`);
  }

  const sql = `
    SELECT id, slug, name, domain, surface, description, created_at, updated_at
      FROM literacy_concepts
      ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
      ORDER BY slug
      LIMIT ${Math.min(Math.max(opts.limit ?? 200, 1), 1000)}
  `;
  const result = await query<LiteracyConcept>(sql, params);
  return result.rows;
}

export async function getConceptBySlug(slug: string): Promise<LiteracyConcept | null> {
  if (!process.env.DATABASE_URL) return null;
  const { query } = await import("@/lib/db");
  const result = await query<LiteracyConcept>(
    `SELECT id, slug, name, domain, surface, description, created_at, updated_at
       FROM literacy_concepts WHERE slug = $1 LIMIT 1`,
    [slug],
  );
  return result.rows[0] ?? null;
}

export async function getConceptById(id: string): Promise<LiteracyConcept | null> {
  if (!process.env.DATABASE_URL) return null;
  const { query } = await import("@/lib/db");
  const result = await query<LiteracyConcept>(
    `SELECT id, slug, name, domain, surface, description, created_at, updated_at
       FROM literacy_concepts WHERE id = $1 LIMIT 1`,
    [id],
  );
  return result.rows[0] ?? null;
}

/* ------------------------------------------------------------------ */
/*  Writes                                                              */
/* ------------------------------------------------------------------ */

/**
 * Create a concept. Slug must be unique — duplicates raise a
 * LiteracyValidationError instead of a raw 23505. Fans out to Neo4j.
 */
export async function createConcept(
  input: CreateConceptInput,
): Promise<LiteracyConcept> {
  validateCreate(input);

  if (!process.env.DATABASE_URL) {
    throw new Error("createConcept requires DATABASE_URL");
  }

  const { query } = await import("@/lib/db");

  // Pre-flight uniqueness so we can surface a typed error instead of
  // letting Postgres throw a 23505 we'd have to parse downstream.
  const dupe = await query(
    `SELECT 1 FROM literacy_concepts WHERE slug = $1 LIMIT 1`,
    [input.slug],
  );
  if (dupe.rows.length > 0) {
    throw new LiteracyValidationError("slug", `slug already exists: ${input.slug}`);
  }

  const result = await query<LiteracyConcept>(
    `INSERT INTO literacy_concepts (slug, name, domain, surface, description)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, slug, name, domain, surface, description, created_at, updated_at`,
    [
      input.slug,
      input.name,
      input.domain,
      input.surface ?? null,
      input.description ?? null,
    ],
  );
  const concept = result.rows[0];
  await fanOutConceptToNeo4j(concept);
  return concept;
}

/**
 * Idempotent upsert by slug. Used by the seed script. Refreshes the
 * Neo4j node on every call.
 */
export async function upsertConceptBySlug(
  input: CreateConceptInput,
): Promise<LiteracyConcept> {
  validateCreate(input);
  if (!process.env.DATABASE_URL) {
    throw new Error("upsertConceptBySlug requires DATABASE_URL");
  }
  const { query } = await import("@/lib/db");
  const result = await query<LiteracyConcept>(
    `INSERT INTO literacy_concepts (slug, name, domain, surface, description)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (slug) DO UPDATE
       SET name = EXCLUDED.name,
           domain = EXCLUDED.domain,
           surface = EXCLUDED.surface,
           description = EXCLUDED.description,
           updated_at = NOW()
     RETURNING id, slug, name, domain, surface, description, created_at, updated_at`,
    [
      input.slug,
      input.name,
      input.domain,
      input.surface ?? null,
      input.description ?? null,
    ],
  );
  const concept = result.rows[0];
  await fanOutConceptToNeo4j(concept);
  return concept;
}

export async function patchConcept(
  id: string,
  patch: PatchConceptInput,
): Promise<LiteracyConcept | null> {
  if (patch.domain && !CONCEPT_DOMAINS.includes(patch.domain)) {
    throw new LiteracyValidationError("domain", `invalid domain: ${patch.domain}`);
  }
  if (patch.name !== undefined && patch.name.trim().length === 0) {
    throw new LiteracyValidationError("name", "name cannot be blank");
  }

  if (!process.env.DATABASE_URL) {
    throw new Error("patchConcept requires DATABASE_URL");
  }
  const { query } = await import("@/lib/db");

  const sets: string[] = [];
  const params: unknown[] = [];
  if (patch.name !== undefined) {
    params.push(patch.name);
    sets.push(`name = $${params.length}`);
  }
  if (patch.domain !== undefined) {
    params.push(patch.domain);
    sets.push(`domain = $${params.length}`);
  }
  if (patch.surface !== undefined) {
    params.push(patch.surface);
    sets.push(`surface = $${params.length}`);
  }
  if (patch.description !== undefined) {
    params.push(patch.description);
    sets.push(`description = $${params.length}`);
  }
  if (sets.length === 0) {
    return getConceptById(id);
  }
  params.push(id);
  const result = await query<LiteracyConcept>(
    `UPDATE literacy_concepts
        SET ${sets.join(", ")}, updated_at = NOW()
      WHERE id = $${params.length}
      RETURNING id, slug, name, domain, surface, description, created_at, updated_at`,
    params,
  );
  const concept = result.rows[0];
  if (concept) await fanOutConceptToNeo4j(concept);
  return concept ?? null;
}

export async function deleteConcept(id: string): Promise<boolean> {
  if (!process.env.DATABASE_URL) {
    throw new Error("deleteConcept requires DATABASE_URL");
  }
  const { query } = await import("@/lib/db");
  const result = await query(
    `DELETE FROM literacy_concepts WHERE id = $1 RETURNING id`,
    [id],
  );
  const deleted = result.rows.length > 0;
  if (deleted) await deleteConceptFromNeo4j(id);
  return deleted;
}
