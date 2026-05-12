/* eslint-disable @typescript-eslint/no-explicit-any */
const mockQuery = jest.fn();
jest.mock("@/lib/db", () => ({
  query: (...a: any[]) => mockQuery(...a),
  pool: { connect: jest.fn(), query: jest.fn(), end: jest.fn() },
}));

import {
  createTranslation,
  upsertTranslation,
  patchTranslation,
  getTranslation,
  renderTemplate,
} from "../translations";
import { LiteracyValidationError } from "../concepts";

beforeEach(() => {
  mockQuery.mockReset();
  process.env.DATABASE_URL = "postgres://test";
});
afterEach(() => {
  delete process.env.DATABASE_URL;
});

const METRIC_ID = "22222222-2222-2222-2222-222222222222";

describe("renderTemplate", () => {
  test("substitutes named variables", () => {
    expect(renderTemplate("Hello {name}, value is {value}", { name: "Pat", value: 42 }))
      .toBe("Hello Pat, value is 42");
  });

  test("leaves missing variables untouched", () => {
    expect(renderTemplate("Hello {missing}", {})).toBe("Hello {missing}");
  });

  test("ignores nested-substitution attacks (single pass)", () => {
    expect(renderTemplate("{outer}", { outer: "{inner}", inner: "boom" }))
      .toBe("{inner}");
  });
});

describe("createTranslation validation", () => {
  test("rejects bad role", async () => {
    await expect(
      createTranslation({
        metric_id: METRIC_ID,
        role: "ceo" as any,
        template: "x",
      }),
    ).rejects.toBeInstanceOf(LiteracyValidationError);
  });

  test("rejects empty template", async () => {
    await expect(
      createTranslation({
        metric_id: METRIC_ID,
        role: "salesperson",
        template: "  ",
      }),
    ).rejects.toBeInstanceOf(LiteracyValidationError);
  });

  test("rejects quality_score out of [0,1]", async () => {
    await expect(
      createTranslation({
        metric_id: METRIC_ID,
        role: "salesperson",
        template: "ok",
        quality_score: 2,
      }),
    ).rejects.toBeInstanceOf(LiteracyValidationError);
  });
});

describe("upsertTranslation", () => {
  test("uses ON CONFLICT (metric_id, role, COALESCE(context, ''))", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: "id",
          metric_id: METRIC_ID,
          role: "salesperson",
          context: null,
          template: "ok",
          source: "curated",
          quality_score: 0.5,
          created_at: "",
        },
      ],
    });
    await upsertTranslation({
      metric_id: METRIC_ID,
      role: "salesperson",
      template: "ok",
    });
    expect(mockQuery.mock.calls[0][0]).toMatch(
      /ON CONFLICT \(metric_id, role, \(COALESCE\(context, ''\)\)\) DO UPDATE/,
    );
  });
});

describe("patchTranslation", () => {
  test("rejects blank template", async () => {
    await expect(
      patchTranslation("11111111-1111-1111-1111-111111111111", { template: "  " }),
    ).rejects.toBeInstanceOf(LiteracyValidationError);
  });
});

describe("getTranslation lookup", () => {
  test("returns null when metric does not exist", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] }); // metric lookup
    const result = await getTranslation("missing_metric", "salesperson", {
      value: 42,
    });
    expect(result).toBeNull();
  });

  test("renders template with metric.name + variables", async () => {
    mockQuery
      // getMetricBySlug
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
      // translation lookup
      .mockResolvedValueOnce({
        rows: [
          {
            id: "id",
            metric_id: METRIC_ID,
            role: "salesperson",
            context: null,
            template: "{metric} is {value}%.",
            source: "curated",
            quality_score: 0.7,
            created_at: "",
          },
        ],
      });
    const result = await getTranslation("vdp_scroll_depth", "salesperson", {
      value: 80,
    });
    expect(result?.rendered).toBe("VDP Scroll Depth is 80%.");
  });
});
