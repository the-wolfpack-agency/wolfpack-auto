/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Unit tests for literacy-ontology/concepts.ts.
 *
 * Validates the validation surface, the upsert+fan-out wiring, and the
 * Neo4j fan-out call shape. DB writes go through a mocked `query` so we
 * exercise SQL shape + parameter ordering without a real Postgres.
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
  createConcept,
  upsertConceptBySlug,
  patchConcept,
  deleteConcept,
  listConcepts,
  LiteracyValidationError,
} from "../concepts";

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

describe("createConcept", () => {
  test("rejects an empty slug", async () => {
    await expect(
      createConcept({ slug: "", name: "X", domain: "digital" }),
    ).rejects.toBeInstanceOf(LiteracyValidationError);
  });

  test("rejects a slug with uppercase letters", async () => {
    await expect(
      createConcept({ slug: "Vdp", name: "X", domain: "digital" }),
    ).rejects.toBeInstanceOf(LiteracyValidationError);
  });

  test("rejects a slug with hyphens (only underscores allowed)", async () => {
    await expect(
      createConcept({ slug: "front-row", name: "X", domain: "physical" }),
    ).rejects.toBeInstanceOf(LiteracyValidationError);
  });

  test("rejects blank name", async () => {
    await expect(
      createConcept({ slug: "vdp", name: "  ", domain: "digital" }),
    ).rejects.toBeInstanceOf(LiteracyValidationError);
  });

  test("rejects invalid domain", async () => {
    await expect(
      createConcept({ slug: "vdp", name: "VDP", domain: "weather" as any }),
    ).rejects.toBeInstanceOf(LiteracyValidationError);
  });

  test("rejects duplicate slug", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ exists: 1 }] });
    await expect(
      createConcept({ slug: "vdp", name: "VDP", domain: "digital" }),
    ).rejects.toBeInstanceOf(LiteracyValidationError);
  });

  test("inserts + fans out to Neo4j on success", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] }) // dupe check
      .mockResolvedValueOnce({
        rows: [
          {
            id: "11111111-1111-1111-1111-111111111111",
            slug: "vdp",
            name: "Vehicle Detail Page",
            domain: "digital",
            surface: "website",
            description: "...",
            created_at: "now",
            updated_at: "now",
          },
        ],
      });
    const concept = await createConcept({
      slug: "vdp",
      name: "Vehicle Detail Page",
      domain: "digital",
      surface: "website",
      description: "...",
    });
    expect(concept.slug).toBe("vdp");
    expect(mockExecuteNeo4j).toHaveBeenCalledTimes(1);
    const call = mockExecuteNeo4j.mock.calls[0][0][0];
    expect(call.statement).toMatch(/MERGE \(c:Concept/);
    expect(call.parameters.slug).toBe("vdp");
  });
});

describe("upsertConceptBySlug", () => {
  test("uses ON CONFLICT (slug) DO UPDATE", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: "11111111-1111-1111-1111-111111111111",
          slug: "vdp",
          name: "Vehicle Detail Page",
          domain: "digital",
          surface: "website",
          description: "...",
          created_at: "now",
          updated_at: "now",
        },
      ],
    });
    await upsertConceptBySlug({
      slug: "vdp",
      name: "Vehicle Detail Page",
      domain: "digital",
    });
    const sql = mockQuery.mock.calls[0][0];
    expect(sql).toMatch(/ON CONFLICT \(slug\) DO UPDATE/);
  });
});

describe("patchConcept", () => {
  test("rejects blank name", async () => {
    await expect(
      patchConcept("11111111-1111-1111-1111-111111111111", { name: "" }),
    ).rejects.toBeInstanceOf(LiteracyValidationError);
  });

  test("rejects invalid domain", async () => {
    await expect(
      patchConcept("11111111-1111-1111-1111-111111111111", {
        domain: "bogus" as any,
      }),
    ).rejects.toBeInstanceOf(LiteracyValidationError);
  });

  test("returns existing record when patch is empty", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: "abc", slug: "vdp", name: "x", domain: "digital", surface: null, description: null, created_at: "", updated_at: "" }],
    });
    const result = await patchConcept("11111111-1111-1111-1111-111111111111", {});
    expect(result?.slug).toBe("vdp");
  });

  test("builds UPDATE SET clause from supplied fields", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: "11111111-1111-1111-1111-111111111111",
          slug: "vdp",
          name: "New",
          domain: "digital",
          surface: "website",
          description: null,
          created_at: "now",
          updated_at: "now",
        },
      ],
    });
    await patchConcept("11111111-1111-1111-1111-111111111111", {
      name: "New",
      domain: "digital",
    });
    const sql = mockQuery.mock.calls[0][0];
    expect(sql).toMatch(/UPDATE literacy_concepts/);
    expect(sql).toMatch(/SET name = \$1, domain = \$2/);
  });
});

describe("deleteConcept", () => {
  test("returns true when a row is deleted and fans out delete to Neo4j", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: "x" }] });
    const ok = await deleteConcept("11111111-1111-1111-1111-111111111111");
    expect(ok).toBe(true);
    expect(mockExecuteNeo4j).toHaveBeenCalledTimes(1);
    expect(mockExecuteNeo4j.mock.calls[0][0][0].statement).toMatch(
      /DETACH DELETE/,
    );
  });

  test("returns false when nothing matched", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const ok = await deleteConcept("11111111-1111-1111-1111-111111111111");
    expect(ok).toBe(false);
    expect(mockExecuteNeo4j).not.toHaveBeenCalled();
  });
});

describe("listConcepts", () => {
  test("no DATABASE_URL → empty", async () => {
    delete process.env.DATABASE_URL;
    const result = await listConcepts();
    expect(result).toEqual([]);
  });

  test("filters by domain + surface", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    await listConcepts({ domain: "physical", surface: "lot" });
    const sql = mockQuery.mock.calls[0][0];
    const params = mockQuery.mock.calls[0][1];
    expect(sql).toMatch(/WHERE domain = \$1 AND surface = \$2/);
    expect(params).toEqual(["physical", "lot"]);
  });
});
