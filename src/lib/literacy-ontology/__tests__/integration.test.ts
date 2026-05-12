/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Integration test — end-to-end through the literacy ontology lib.
 *
 * Walks a translation lookup from concept → metric → role-specific
 * translation. Asserts the lookup composes correctly across the lib
 * surface and renders the expected lot-language template.
 *
 * Uses a mocked @/lib/db so the test runs in CI without a Postgres,
 * but exercises the SAME code paths that the real DB call would.
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
  createMetric,
  createTranslation,
  getTranslation,
} from "../index";

const CONCEPT_ID = "aaaaaaaa-1111-1111-1111-111111111111";
const METRIC_ID = "bbbbbbbb-2222-2222-2222-222222222222";
const TRANSLATION_ID = "cccccccc-3333-3333-3333-333333333333";

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

test("concept → metric → translation → render lookup composes", async () => {
  // Step 1: createConcept — 1 dupe-check query (empty), 1 INSERT query.
  mockQuery
    .mockResolvedValueOnce({ rows: [] })
    .mockResolvedValueOnce({
      rows: [
        {
          id: CONCEPT_ID,
          slug: "fi_desk",
          name: "F&I Desk",
          domain: "physical",
          surface: "fi_desk",
          description: "Finance & Insurance office",
          created_at: "now",
          updated_at: "now",
        },
      ],
    });
  const concept = await createConcept({
    slug: "fi_desk",
    name: "F&I Desk",
    domain: "physical",
    surface: "fi_desk",
    description: "Finance & Insurance office",
  });
  expect(concept.id).toBe(CONCEPT_ID);

  // Step 2: createMetric — 1 dupe-check, 1 INSERT.
  mockQuery
    .mockResolvedValueOnce({ rows: [] })
    .mockResolvedValueOnce({
      rows: [
        {
          id: METRIC_ID,
          slug: "fi_attach_rate_gap",
          name: "F&I Product Attach Rate Gap",
          concept_id: CONCEPT_ID,
          unit: "percent",
          good_direction: "lower",
          description: "Gap to benchmark",
          created_at: "now",
        },
      ],
    });
  const metric = await createMetric({
    slug: "fi_attach_rate_gap",
    name: "F&I Product Attach Rate Gap",
    concept_id: CONCEPT_ID,
    unit: "percent",
    good_direction: "lower",
    description: "Gap to benchmark",
  });
  expect(metric.id).toBe(METRIC_ID);

  // Step 3: createTranslation — 1 INSERT.
  mockQuery.mockResolvedValueOnce({
    rows: [
      {
        id: TRANSLATION_ID,
        metric_id: METRIC_ID,
        role: "fi_manager",
        context: null,
        template:
          "You're {value}% below benchmark on F&I product attach. That's customers walking out of your F&I desk without coverage.",
        source: "curated",
        quality_score: 0.7,
        created_at: "now",
      },
    ],
  });
  const translation = await createTranslation({
    metric_id: METRIC_ID,
    role: "fi_manager",
    template:
      "You're {value}% below benchmark on F&I product attach. That's customers walking out of your F&I desk without coverage.",
    quality_score: 0.7,
  });
  expect(translation.id).toBe(TRANSLATION_ID);

  // Step 4: getTranslation — 1 SELECT to load the metric, 1 SELECT to look up
  // the translation. Render with value=4.
  mockQuery
    .mockResolvedValueOnce({
      rows: [
        {
          id: METRIC_ID,
          slug: "fi_attach_rate_gap",
          name: "F&I Product Attach Rate Gap",
          concept_id: CONCEPT_ID,
          unit: "percent",
          good_direction: "lower",
          description: "Gap to benchmark",
          created_at: "now",
        },
      ],
    })
    .mockResolvedValueOnce({
      rows: [
        {
          id: TRANSLATION_ID,
          metric_id: METRIC_ID,
          role: "fi_manager",
          context: null,
          template:
            "You're {value}% below benchmark on F&I product attach. That's customers walking out of your F&I desk without coverage.",
          source: "curated",
          quality_score: 0.7,
          created_at: "now",
        },
      ],
    });

  const result = await getTranslation("fi_attach_rate_gap", "fi_manager", {
    value: 4,
  });
  expect(result).not.toBeNull();
  expect(result?.rendered).toBe(
    "You're 4% below benchmark on F&I product attach. That's customers walking out of your F&I desk without coverage.",
  );
  expect(result?.translation.role).toBe("fi_manager");
});

test("getTranslation falls back to role='any' when no specific translation exists", async () => {
  mockQuery
    // metric lookup
    .mockResolvedValueOnce({
      rows: [
        {
          id: METRIC_ID,
          slug: "vdp_scroll_depth",
          name: "VDP Scroll Depth",
          concept_id: null,
          unit: "percent",
          good_direction: "higher",
          description: "",
          created_at: "",
        },
      ],
    })
    // translation lookup: only an 'any' role row available
    .mockResolvedValueOnce({
      rows: [
        {
          id: "any-id",
          metric_id: METRIC_ID,
          role: "any",
          context: null,
          template: "{metric} fallback: {value}",
          source: "curated",
          quality_score: 0.5,
          created_at: "",
        },
      ],
    });
  const result = await getTranslation("vdp_scroll_depth", "controller", { value: 80 });
  expect(result?.rendered).toBe("VDP Scroll Depth fallback: 80");
  expect(result?.translation.role).toBe("any");
});
