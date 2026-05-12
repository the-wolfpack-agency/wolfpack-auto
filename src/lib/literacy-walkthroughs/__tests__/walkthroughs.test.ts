/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Unit tests for src/lib/literacy-walkthroughs/walkthroughs.ts.
 *
 * Validates step-level rules, CRUD shape, quality_score guards, and the
 * role-aware public-side fetch. Uses mocked @/lib/db so the suite runs in
 * CI without Postgres while exercising the real code paths.
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
  createWalkthrough,
  getWalkthroughForRole,
  patchWalkthrough,
  validateStep,
  WALKTHROUGH_TRIGGERS,
} from "../walkthroughs";
import { LiteracyValidationError } from "@/lib/literacy-ontology";

const WALK_ID = "11111111-1111-4111-8111-111111111111";
const CONCEPT_ID = "22222222-2222-4222-8222-222222222222";

beforeEach(() => {
  mockQuery.mockReset();
  mockExecuteNeo4j.mockReset();
  mockExecuteNeo4j.mockResolvedValue({ executed: 1, failed: 0 });
  process.env.DATABASE_URL = "postgres://test";
});

afterEach(() => {
  delete process.env.DATABASE_URL;
});

describe("validateStep", () => {
  test("accepts a minimal valid step", () => {
    expect(() =>
      validateStep({ selector: "[data-x]", template: "Hi" }, 0),
    ).not.toThrow();
  });

  test("rejects missing selector", () => {
    expect(() => validateStep({ template: "Hi" }, 0)).toThrow(
      LiteracyValidationError,
    );
  });

  test("rejects empty template", () => {
    expect(() => validateStep({ selector: "[x]", template: "   " }, 0)).toThrow(
      LiteracyValidationError,
    );
  });

  test("rejects invalid position", () => {
    expect(() =>
      validateStep(
        { selector: "[x]", template: "Hi", position: "diagonal" },
        0,
      ),
    ).toThrow(LiteracyValidationError);
  });

  test("rejects non-object step", () => {
    expect(() => validateStep("not an object", 0)).toThrow(
      LiteracyValidationError,
    );
  });
});

describe("createWalkthrough", () => {
  const validInput = {
    slug: "salesperson_dash_intro",
    name: "Salesperson dashboard intro",
    role: "salesperson" as const,
    surface: "dashboard",
    trigger_condition: "first_visit" as const,
    steps: [
      { selector: "[data-x]", template: "Welcome", position: "bottom" as const },
    ],
  };

  test("inserts a new walkthrough and fans out to Neo4j", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] }) // dupe check
      .mockResolvedValueOnce({
        rows: [
          {
            id: WALK_ID,
            slug: validInput.slug,
            name: validInput.name,
            role: validInput.role,
            surface: validInput.surface,
            trigger_condition: validInput.trigger_condition,
            steps: JSON.stringify(validInput.steps),
            source: "ai_proposed",
            quality_score: 0.5,
            active: true,
            created_at: "2026-05-12T00:00:00Z",
            updated_at: "2026-05-12T00:00:00Z",
          },
        ],
      });

    process.env.NEO4J_URI = "neo4j://test";
    const walkthrough = await createWalkthrough(validInput);
    delete process.env.NEO4J_URI;

    expect(walkthrough.id).toBe(WALK_ID);
    expect(walkthrough.source).toBe("ai_proposed");
    expect(walkthrough.steps).toHaveLength(1);
    expect(mockExecuteNeo4j).toHaveBeenCalled();
  });

  test("rejects duplicate slug with a typed error", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ "?column?": 1 }] }); // dupe found
    await expect(createWalkthrough(validInput)).rejects.toThrow(
      LiteracyValidationError,
    );
  });

  test("rejects empty steps", async () => {
    await expect(
      createWalkthrough({ ...validInput, steps: [] }),
    ).rejects.toThrow(LiteracyValidationError);
  });

  test("rejects invalid role", async () => {
    await expect(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      createWalkthrough({ ...validInput, role: "nope" as any }),
    ).rejects.toThrow(LiteracyValidationError);
  });

  test("rejects invalid trigger_condition", async () => {
    await expect(
      createWalkthrough({
        ...validInput,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        trigger_condition: "whenever" as any,
      }),
    ).rejects.toThrow(LiteracyValidationError);
  });

  test("rejects out-of-range quality_score", async () => {
    await expect(
      createWalkthrough({ ...validInput, quality_score: 2 }),
    ).rejects.toThrow(LiteracyValidationError);
  });
});

describe("patchWalkthrough", () => {
  test("rejects empty step list on patch", async () => {
    await expect(
      patchWalkthrough(WALK_ID, { steps: [] }),
    ).rejects.toThrow(LiteracyValidationError);
  });

  test("returns null when row does not exist", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const out = await patchWalkthrough(WALK_ID, { name: "New" });
    expect(out).toBeNull();
  });

  test("updates quality_score", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: WALK_ID,
          slug: "s",
          name: "n",
          role: "salesperson",
          surface: null,
          trigger_condition: null,
          steps: [{ selector: "[x]", template: "y" }],
          source: "ai_approved",
          quality_score: 0.9,
          active: true,
          created_at: "",
          updated_at: "",
        },
      ],
    });
    const out = await patchWalkthrough(WALK_ID, { quality_score: 0.9 });
    expect(out?.quality_score).toBe(0.9);
  });
});

describe("getWalkthroughForRole", () => {
  test("hydrates JSON steps from the DB", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: WALK_ID,
          slug: "first_visit_dash",
          name: "Intro",
          role: "fi_manager",
          surface: "dashboard",
          trigger_condition: "first_visit",
          steps: JSON.stringify([
            { selector: "[data-a]", template: "A", position: "bottom" },
            { selector: "[data-b]", template: "B" },
          ]),
          source: "ai_proposed",
          quality_score: 0.7,
          active: true,
          created_at: "",
          updated_at: "",
        },
      ],
    });
    const out = await getWalkthroughForRole("first_visit_dash", "fi_manager");
    expect(out?.steps).toHaveLength(2);
    expect(out?.steps[0].selector).toBe("[data-a]");
    expect(out?.steps[1].template).toBe("B");
  });

  test("returns null when no row matches", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const out = await getWalkthroughForRole("missing", "salesperson");
    expect(out).toBeNull();
  });
});

describe("WALKTHROUGH_TRIGGERS", () => {
  test("exposes the documented trigger set", () => {
    expect(WALKTHROUGH_TRIGGERS).toEqual([
      "first_login",
      "first_visit",
      "manual",
    ]);
  });
});

// CONCEPT_ID is exported only to keep this import alive for IDE crossref —
// other tests reference it via `concept_id` on step objects.
export { CONCEPT_ID };
