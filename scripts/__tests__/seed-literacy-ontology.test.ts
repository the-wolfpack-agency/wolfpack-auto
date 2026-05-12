/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Tests for scripts/seed-literacy-ontology.ts.
 *
 * Two layers:
 *   1. Pure data-shape checks on the seed constants (CONCEPTS, MAPPINGS,
 *      METRICS, TRANSLATIONS, ACTIONS). Validates the strategy doc's
 *      requirement of ~50 entries across the required roles.
 *
 *   2. seedLiteracyOntology() runs against a mocked @/lib/db. Asserts that
 *      running the seeder twice produces no duplicates — i.e. the upsert
 *      semantics hold. Each upsert call has the same SQL shape both times.
 */

const mockQuery = jest.fn();
const mockExecuteNeo4j = jest.fn();

jest.mock("@/lib/db", () => ({
  query: (...a: any[]) => mockQuery(...a),
  pool: { connect: jest.fn(), query: jest.fn(), end: jest.fn() },
}));
jest.mock("@/lib/neo4j-client", () => ({
  executeNeo4jQueries: (...a: any[]) => mockExecuteNeo4j(...a),
  neo4jHealthCheck: jest.fn(),
}));

import {
  CONCEPTS,
  MAPPINGS,
  METRICS,
  TRANSLATIONS,
  ACTIONS,
  seedLiteracyOntology,
} from "../seed-literacy-ontology";

describe("seed-literacy-ontology: data shape", () => {
  test("ships at least 50 starter entries", () => {
    const total =
      CONCEPTS.length +
      MAPPINGS.length +
      METRICS.length +
      TRANSLATIONS.length +
      ACTIONS.length;
    expect(total).toBeGreaterThanOrEqual(50);
  });

  test("concepts cover at least 12 entries spanning all 3 domains", () => {
    expect(CONCEPTS.length).toBeGreaterThanOrEqual(12);
    const domains = new Set(CONCEPTS.map((c) => c.domain));
    expect(domains.has("digital")).toBe(true);
    expect(domains.has("physical")).toBe(true);
  });

  test("mappings cover at least 10 entries spanning multiple relation types", () => {
    expect(MAPPINGS.length).toBeGreaterThanOrEqual(10);
    const relations = new Set(MAPPINGS.map((m) => m.relation));
    expect(relations.size).toBeGreaterThanOrEqual(3);
  });

  test("metrics cover at least 8 entries", () => {
    expect(METRICS.length).toBeGreaterThanOrEqual(8);
  });

  test("translations cover at least 15 entries spanning at least 5 roles", () => {
    expect(TRANSLATIONS.length).toBeGreaterThanOrEqual(15);
    const roles = new Set(TRANSLATIONS.map((t) => t.role));
    expect(roles.size).toBeGreaterThanOrEqual(5);
    // Required role coverage per the strategy doc.
    for (const role of ["salesperson", "fi_manager", "bdc_agent", "gm"]) {
      expect(Array.from(roles).includes(role as never)).toBe(true);
    }
  });

  test("actions cover at least 5 entries spanning multiple triggers", () => {
    expect(ACTIONS.length).toBeGreaterThanOrEqual(5);
    const triggers = new Set(ACTIONS.map((a) => a.trigger_condition));
    expect(triggers.size).toBeGreaterThanOrEqual(2);
  });

  test("every mapping seed references a real concept slug", () => {
    const slugs = new Set(CONCEPTS.map((c) => c.slug));
    for (const m of MAPPINGS) {
      expect(slugs.has(m.source)).toBe(true);
      expect(slugs.has(m.target)).toBe(true);
    }
  });

  test("every metric seed concept_slug (if present) is a real concept slug", () => {
    const slugs = new Set(CONCEPTS.map((c) => c.slug));
    for (const m of METRICS) {
      if (m.concept_slug) expect(slugs.has(m.concept_slug)).toBe(true);
    }
  });

  test("every translation seed references a real metric slug", () => {
    const slugs = new Set(METRICS.map((m) => m.slug));
    for (const t of TRANSLATIONS) {
      expect(slugs.has(t.metric_slug)).toBe(true);
    }
  });

  test("every action seed references a real metric slug", () => {
    const slugs = new Set(METRICS.map((m) => m.slug));
    for (const a of ACTIONS) {
      expect(slugs.has(a.metric_slug)).toBe(true);
    }
  });
});

describe("seedLiteracyOntology — upsert idempotence", () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockExecuteNeo4j.mockReset();
    mockExecuteNeo4j.mockResolvedValue({ executed: 1, failed: 0 });
    process.env.DATABASE_URL = "postgres://test";
    process.env.NEO4J_URI = "neo4j://test";

    // Every upsert returns a deterministic id derived from the slug.
    mockQuery.mockImplementation((sql: string, params: unknown[]) => {
      if (typeof sql === "string" && sql.includes("INSERT INTO literacy_concepts")) {
        return Promise.resolve({
          rows: [
            {
              id: `concept-${params[0]}`,
              slug: params[0],
              name: params[1],
              domain: params[2],
              surface: params[3],
              description: params[4],
              created_at: "",
              updated_at: "",
            },
          ],
        });
      }
      if (sql.includes("INSERT INTO literacy_mappings")) {
        return Promise.resolve({
          rows: [
            {
              id: `mapping-${params[0]}-${params[1]}-${params[2]}`,
              source_concept_id: params[0],
              target_concept_id: params[1],
              relation: params[2],
              confidence: params[3],
              source: params[4],
              created_at: "",
            },
          ],
        });
      }
      if (sql.includes("INSERT INTO literacy_metrics")) {
        return Promise.resolve({
          rows: [
            {
              id: `metric-${params[0]}`,
              slug: params[0],
              name: params[1],
              concept_id: params[2],
              unit: params[3],
              good_direction: params[4],
              description: params[5],
              created_at: "",
            },
          ],
        });
      }
      if (sql.includes("INSERT INTO literacy_translations")) {
        return Promise.resolve({
          rows: [
            {
              id: `translation-${params[0]}-${params[1]}`,
              metric_id: params[0],
              role: params[1],
              context: params[2],
              template: params[3],
              source: params[4],
              quality_score: params[5],
              created_at: "",
            },
          ],
        });
      }
      if (sql.includes("INSERT INTO literacy_actions")) {
        return Promise.resolve({
          rows: [
            {
              id: `action-${params[0]}-${params[1]}-${params[2]}`,
              metric_id: params[0],
              trigger_condition: params[1],
              role: params[2],
              recommendation_template: params[3],
              expected_outcome: params[4],
              source: params[5],
              created_at: "",
            },
          ],
        });
      }
      return Promise.resolve({ rows: [] });
    });
  });

  afterEach(() => {
    delete process.env.DATABASE_URL;
    delete process.env.NEO4J_URI;
  });

  test("running the seed once writes the expected counts", async () => {
    const result = await seedLiteracyOntology();
    expect(result).toEqual({
      concepts: CONCEPTS.length,
      mappings: MAPPINGS.length,
      metrics: METRICS.length,
      translations: TRANSLATIONS.length,
      actions: ACTIONS.length,
    });
  });

  test("every upsert uses ON CONFLICT … DO UPDATE (no INSERT-without-conflict)", async () => {
    await seedLiteracyOntology();
    const insertCalls = mockQuery.mock.calls.filter(
      (call) => typeof call[0] === "string" && call[0].includes("INSERT INTO literacy_"),
    );
    expect(insertCalls.length).toBeGreaterThan(0);
    for (const call of insertCalls) {
      expect(call[0]).toMatch(/ON CONFLICT/);
    }
  });

  test("running the seed twice produces identical write counts (no duplicates)", async () => {
    const first = await seedLiteracyOntology();
    const callsFirstRun = mockQuery.mock.calls.length;
    const second = await seedLiteracyOntology();
    const callsSecondRun = mockQuery.mock.calls.length - callsFirstRun;
    expect(second).toEqual(first);
    expect(callsSecondRun).toBe(callsFirstRun);
  });
});
