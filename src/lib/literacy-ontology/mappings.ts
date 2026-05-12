/**
 * Mappings CRUD — typed relations between concepts.
 *
 * Mutating helpers fan out to Neo4j as typed edges between :Concept nodes.
 * The relation enum becomes the edge label (e.g. `:EQUIVALENT_TO`,
 * `:ANALOG_OF`). Postgres remains the source of truth.
 */

import type {
  CreateMappingInput,
  LiteracyMapping,
  MappingRelation,
} from "./types";
import { MAPPING_RELATIONS, LITERACY_SOURCES } from "./types";
import { LiteracyValidationError } from "./concepts";

/* ------------------------------------------------------------------ */
/*  Validation                                                          */
/* ------------------------------------------------------------------ */

function validateCreate(input: CreateMappingInput): void {
  if (!input.source_concept_id) {
    throw new LiteracyValidationError("source_concept_id", "source_concept_id is required");
  }
  if (!input.target_concept_id) {
    throw new LiteracyValidationError("target_concept_id", "target_concept_id is required");
  }
  if (input.source_concept_id === input.target_concept_id) {
    throw new LiteracyValidationError(
      "target_concept_id",
      "source and target must be distinct",
    );
  }
  if (!MAPPING_RELATIONS.includes(input.relation)) {
    throw new LiteracyValidationError(
      "relation",
      `relation must be one of ${MAPPING_RELATIONS.join(", ")} (got: ${input.relation})`,
    );
  }
  if (input.confidence !== undefined) {
    if (typeof input.confidence !== "number" || input.confidence < 0 || input.confidence > 1) {
      throw new LiteracyValidationError(
        "confidence",
        "confidence must be a number in [0, 1]",
      );
    }
  }
  if (input.source !== undefined && !LITERACY_SOURCES.includes(input.source)) {
    throw new LiteracyValidationError("source", `invalid source: ${input.source}`);
  }
}

/* ------------------------------------------------------------------ */
/*  Neo4j fan-out                                                       */
/* ------------------------------------------------------------------ */

/** Cypher label-safe form of the relation enum (e.g. equivalent_to → EQUIVALENT_TO). */
export function relationLabel(relation: MappingRelation): string {
  return relation.toUpperCase();
}

async function fanOutMappingToNeo4j(
  mapping: LiteracyMapping,
): Promise<void> {
  const neo4jUrl = process.env.NEO4J_URI || process.env.NEO4J_URL;
  if (!neo4jUrl) return;
  try {
    const { executeNeo4jQueries } = await import("@/lib/neo4j-client");
    // Edge label cannot be parameterized in Cypher — splice the validated
    // enum directly. relationLabel() ensures the value came from the
    // whitelisted MAPPING_RELATIONS list (no injection surface).
    const label = relationLabel(mapping.relation);
    await executeNeo4jQueries([
      {
        statement: `
          MATCH (s:Concept {id: $sourceId})
          MATCH (t:Concept {id: $targetId})
          MERGE (s)-[r:${label} {mapping_id: $mappingId}]->(t)
          SET r.confidence = $confidence,
              r.source = $source,
              r.created_at = datetime($createdAt)
        `,
        parameters: {
          sourceId: mapping.source_concept_id,
          targetId: mapping.target_concept_id,
          mappingId: mapping.id,
          confidence: mapping.confidence,
          source: mapping.source,
          createdAt: mapping.created_at,
        },
      },
    ]);
  } catch (err) {
    console.warn(
      "[literacy-ontology] Neo4j mapping fan-out failed (non-blocking):",
      err instanceof Error ? err.message : String(err),
    );
  }
}

async function deleteMappingFromNeo4j(mappingId: string): Promise<void> {
  const neo4jUrl = process.env.NEO4J_URI || process.env.NEO4J_URL;
  if (!neo4jUrl) return;
  try {
    const { executeNeo4jQueries } = await import("@/lib/neo4j-client");
    await executeNeo4jQueries([
      {
        statement: `MATCH ()-[r {mapping_id: $id}]->() DELETE r`,
        parameters: { id: mappingId },
      },
    ]);
  } catch (err) {
    console.warn(
      "[literacy-ontology] Neo4j mapping delete fan-out failed (non-blocking):",
      err instanceof Error ? err.message : String(err),
    );
  }
}

/* ------------------------------------------------------------------ */
/*  Reads                                                               */
/* ------------------------------------------------------------------ */

export async function listMappings(opts: {
  source_concept_id?: string;
  target_concept_id?: string;
  relation?: MappingRelation;
  limit?: number;
} = {}): Promise<LiteracyMapping[]> {
  if (!process.env.DATABASE_URL) return [];
  const { query } = await import("@/lib/db");
  const where: string[] = [];
  const params: unknown[] = [];
  if (opts.source_concept_id) {
    params.push(opts.source_concept_id);
    where.push(`source_concept_id = $${params.length}`);
  }
  if (opts.target_concept_id) {
    params.push(opts.target_concept_id);
    where.push(`target_concept_id = $${params.length}`);
  }
  if (opts.relation) {
    params.push(opts.relation);
    where.push(`relation = $${params.length}`);
  }
  const sql = `
    SELECT id, source_concept_id, target_concept_id, relation, confidence::float AS confidence, source, created_at
      FROM literacy_mappings
      ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
      ORDER BY created_at DESC
      LIMIT ${Math.min(Math.max(opts.limit ?? 200, 1), 1000)}
  `;
  const result = await query<LiteracyMapping>(sql, params);
  return result.rows;
}

/* ------------------------------------------------------------------ */
/*  Writes                                                              */
/* ------------------------------------------------------------------ */

export async function createMapping(
  input: CreateMappingInput,
): Promise<LiteracyMapping> {
  validateCreate(input);
  if (!process.env.DATABASE_URL) {
    throw new Error("createMapping requires DATABASE_URL");
  }
  const { query } = await import("@/lib/db");
  const result = await query<LiteracyMapping>(
    `INSERT INTO literacy_mappings
       (source_concept_id, target_concept_id, relation, confidence, source)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, source_concept_id, target_concept_id, relation,
               confidence::float AS confidence, source, created_at`,
    [
      input.source_concept_id,
      input.target_concept_id,
      input.relation,
      input.confidence ?? 1.0,
      input.source ?? "curated",
    ],
  );
  const mapping = result.rows[0];
  await fanOutMappingToNeo4j(mapping);
  return mapping;
}

/** Upsert keyed on (source, target, relation) for seed-script idempotence. */
export async function upsertMapping(
  input: CreateMappingInput,
): Promise<LiteracyMapping> {
  validateCreate(input);
  if (!process.env.DATABASE_URL) {
    throw new Error("upsertMapping requires DATABASE_URL");
  }
  const { query } = await import("@/lib/db");
  const result = await query<LiteracyMapping>(
    `INSERT INTO literacy_mappings
       (source_concept_id, target_concept_id, relation, confidence, source)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (source_concept_id, target_concept_id, relation) DO UPDATE
       SET confidence = EXCLUDED.confidence,
           source = EXCLUDED.source
     RETURNING id, source_concept_id, target_concept_id, relation,
               confidence::float AS confidence, source, created_at`,
    [
      input.source_concept_id,
      input.target_concept_id,
      input.relation,
      input.confidence ?? 1.0,
      input.source ?? "curated",
    ],
  );
  const mapping = result.rows[0];
  await fanOutMappingToNeo4j(mapping);
  return mapping;
}

export async function deleteMapping(id: string): Promise<boolean> {
  if (!process.env.DATABASE_URL) {
    throw new Error("deleteMapping requires DATABASE_URL");
  }
  const { query } = await import("@/lib/db");
  const result = await query(
    `DELETE FROM literacy_mappings WHERE id = $1 RETURNING id`,
    [id],
  );
  const deleted = result.rows.length > 0;
  if (deleted) await deleteMappingFromNeo4j(id);
  return deleted;
}
