/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Unit tests for src/lib/literacy-walkthroughs/tooltips.ts.
 *
 * Validates input rules, CRUD round-trips, the (concept_id, role) uniqueness
 * guard, and the role-aware fetch fallback (role -> 'any').
 */
const mockQuery = jest.fn();

jest.mock("@/lib/db", () => ({
  query: (...a: any[]) => mockQuery(...a),
  pool: { connect: jest.fn(), query: jest.fn(), end: jest.fn() },
}));

import {
  createTooltip,
  patchTooltip,
  getTooltipForConcept,
} from "../tooltips";
import { LiteracyValidationError } from "@/lib/literacy-ontology";

const TIP_ID = "33333333-3333-4333-8333-333333333333";
const CONCEPT_ID = "44444444-4444-4444-8444-444444444444";

beforeEach(() => {
  mockQuery.mockReset();
  process.env.DATABASE_URL = "postgres://test";
});

afterEach(() => {
  delete process.env.DATABASE_URL;
});

describe("createTooltip", () => {
  const valid = {
    concept_id: CONCEPT_ID,
    role: "salesperson" as const,
    short_text: "Short",
    expanded_text: "Expanded",
  };

  test("inserts a new tooltip and defaults to ai_proposed", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] }) // dupe check
      .mockResolvedValueOnce({
        rows: [
          {
            id: TIP_ID,
            concept_id: CONCEPT_ID,
            role: "salesperson",
            short_text: "Short",
            expanded_text: "Expanded",
            source: "ai_proposed",
            quality_score: 0.5,
            created_at: "",
          },
        ],
      });
    const out = await createTooltip(valid);
    expect(out.source).toBe("ai_proposed");
    expect(out.expanded_text).toBe("Expanded");
  });

  test("rejects duplicate (concept_id, role) with a typed error", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ "?column?": 1 }] });
    await expect(createTooltip(valid)).rejects.toThrow(LiteracyValidationError);
  });

  test("rejects invalid concept_id", async () => {
    await expect(
      createTooltip({ ...valid, concept_id: "not-a-uuid" }),
    ).rejects.toThrow(LiteracyValidationError);
  });

  test("rejects empty short_text", async () => {
    await expect(
      createTooltip({ ...valid, short_text: "   " }),
    ).rejects.toThrow(LiteracyValidationError);
  });

  test("rejects out-of-range quality_score", async () => {
    await expect(
      createTooltip({ ...valid, quality_score: 1.5 }),
    ).rejects.toThrow(LiteracyValidationError);
  });
});

describe("patchTooltip", () => {
  test("rejects blank short_text", async () => {
    await expect(
      patchTooltip(TIP_ID, { short_text: "   " }),
    ).rejects.toThrow(LiteracyValidationError);
  });

  test("rejects invalid source", async () => {
    await expect(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      patchTooltip(TIP_ID, { source: "spurious" as any }),
    ).rejects.toThrow(LiteracyValidationError);
  });

  test("updates quality_score", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: TIP_ID,
          concept_id: CONCEPT_ID,
          role: "salesperson",
          short_text: "s",
          expanded_text: null,
          source: "ai_approved",
          quality_score: 0.9,
          created_at: "",
        },
      ],
    });
    const out = await patchTooltip(TIP_ID, { quality_score: 0.9 });
    expect(out?.quality_score).toBe(0.9);
  });
});

describe("getTooltipForConcept (role fallback)", () => {
  test("prefers role match over role='any'", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: TIP_ID,
          concept_id: CONCEPT_ID,
          role: "fi_manager",
          short_text: "fi-specific",
          expanded_text: "long",
          source: "curated",
          quality_score: 0.8,
          created_at: "",
        },
      ],
    });
    const out = await getTooltipForConcept("fi_desk", "fi_manager");
    expect(out?.role).toBe("fi_manager");
    expect(out?.short_text).toBe("fi-specific");
  });

  test("returns null when no tooltip exists", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const out = await getTooltipForConcept("missing", "salesperson");
    expect(out).toBeNull();
  });
});
