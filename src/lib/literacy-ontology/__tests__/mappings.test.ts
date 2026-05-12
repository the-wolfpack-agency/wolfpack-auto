/* eslint-disable @typescript-eslint/no-explicit-any */
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
  createMapping,
  upsertMapping,
  deleteMapping,
  listMappings,
  relationLabel,
} from "../mappings";
import { LiteracyValidationError } from "../concepts";

beforeEach(() => {
  mockQuery.mockReset();
  mockExecuteNeo4j.mockReset();
  mockExecuteNeo4j.mockResolvedValue({ executed: 1, failed: 0 });
  process.env.DATABASE_URL = "postgres://test";
  process.env.NEO4J_URI = "neo4j://test";
});

afterEach(() => {
  delete process.env.DATABASE_URL;
  delete process.env.NEO4J_URI;
});

const ID_A = "11111111-1111-1111-1111-1111111111aa";
const ID_B = "11111111-1111-1111-1111-1111111111bb";

describe("relationLabel", () => {
  test("uppercases the relation enum for Cypher edges", () => {
    expect(relationLabel("equivalent_to")).toBe("EQUIVALENT_TO");
    expect(relationLabel("analog_of")).toBe("ANALOG_OF");
  });
});

describe("createMapping validation", () => {
  test("rejects when source = target", async () => {
    await expect(
      createMapping({
        source_concept_id: ID_A,
        target_concept_id: ID_A,
        relation: "equivalent_to",
      }),
    ).rejects.toBeInstanceOf(LiteracyValidationError);
  });

  test("rejects bad relation", async () => {
    await expect(
      createMapping({
        source_concept_id: ID_A,
        target_concept_id: ID_B,
        relation: "bogus" as any,
      }),
    ).rejects.toBeInstanceOf(LiteracyValidationError);
  });

  test("rejects confidence out of [0,1]", async () => {
    await expect(
      createMapping({
        source_concept_id: ID_A,
        target_concept_id: ID_B,
        relation: "equivalent_to",
        confidence: 1.5,
      }),
    ).rejects.toBeInstanceOf(LiteracyValidationError);
  });

  test("rejects bad source enum", async () => {
    await expect(
      createMapping({
        source_concept_id: ID_A,
        target_concept_id: ID_B,
        relation: "equivalent_to",
        source: "magic" as any,
      }),
    ).rejects.toBeInstanceOf(LiteracyValidationError);
  });
});

describe("createMapping success", () => {
  test("inserts + fans out a typed edge to Neo4j", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: "33333333-3333-3333-3333-333333333333",
          source_concept_id: ID_A,
          target_concept_id: ID_B,
          relation: "equivalent_to",
          confidence: 0.9,
          source: "curated",
          created_at: "now",
        },
      ],
    });
    await createMapping({
      source_concept_id: ID_A,
      target_concept_id: ID_B,
      relation: "equivalent_to",
      confidence: 0.9,
    });
    const call = mockExecuteNeo4j.mock.calls[0][0][0];
    expect(call.statement).toMatch(/MERGE \(s\)-\[r:EQUIVALENT_TO/);
    expect(call.parameters.sourceId).toBe(ID_A);
    expect(call.parameters.targetId).toBe(ID_B);
  });
});

describe("upsertMapping", () => {
  test("uses ON CONFLICT (source, target, relation)", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: "33333333-3333-3333-3333-333333333333",
          source_concept_id: ID_A,
          target_concept_id: ID_B,
          relation: "analog_of",
          confidence: 0.8,
          source: "curated",
          created_at: "now",
        },
      ],
    });
    await upsertMapping({
      source_concept_id: ID_A,
      target_concept_id: ID_B,
      relation: "analog_of",
      confidence: 0.8,
    });
    expect(mockQuery.mock.calls[0][0]).toMatch(
      /ON CONFLICT \(source_concept_id, target_concept_id, relation\) DO UPDATE/,
    );
  });
});

describe("listMappings", () => {
  test("filters by source + relation when supplied", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    await listMappings({ source_concept_id: ID_A, relation: "precedes" });
    const sql = mockQuery.mock.calls[0][0];
    expect(sql).toMatch(/WHERE source_concept_id = \$1 AND relation = \$2/);
  });
});

describe("deleteMapping", () => {
  test("returns true and fans out delete to Neo4j", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: "x" }] });
    const ok = await deleteMapping("33333333-3333-3333-3333-333333333333");
    expect(ok).toBe(true);
    expect(mockExecuteNeo4j).toHaveBeenCalledTimes(1);
  });
});
