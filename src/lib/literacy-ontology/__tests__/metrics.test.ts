/* eslint-disable @typescript-eslint/no-explicit-any */
const mockQuery = jest.fn();
jest.mock("@/lib/db", () => ({
  query: (...a: any[]) => mockQuery(...a),
  pool: { connect: jest.fn(), query: jest.fn(), end: jest.fn() },
}));

import {
  createMetric,
  upsertMetricBySlug,
  patchMetric,
  deleteMetric,
} from "../metrics";
import { LiteracyValidationError } from "../concepts";

beforeEach(() => {
  mockQuery.mockReset();
  process.env.DATABASE_URL = "postgres://test";
});
afterEach(() => {
  delete process.env.DATABASE_URL;
});

describe("createMetric validation", () => {
  test("rejects bad slug", async () => {
    await expect(
      createMetric({ slug: "Bad Slug", name: "X" }),
    ).rejects.toBeInstanceOf(LiteracyValidationError);
  });

  test("rejects empty name", async () => {
    await expect(
      createMetric({ slug: "vdp_scroll", name: "" }),
    ).rejects.toBeInstanceOf(LiteracyValidationError);
  });

  test("rejects bad good_direction", async () => {
    await expect(
      createMetric({
        slug: "vdp_scroll",
        name: "VDP",
        good_direction: "sideways" as any,
      }),
    ).rejects.toBeInstanceOf(LiteracyValidationError);
  });

  test("rejects duplicate slug", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ exists: 1 }] });
    await expect(
      createMetric({ slug: "vdp_scroll", name: "VDP" }),
    ).rejects.toBeInstanceOf(LiteracyValidationError);
  });
});

describe("createMetric happy path", () => {
  test("inserts and returns the metric", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] }) // dupe
      .mockResolvedValueOnce({
        rows: [
          {
            id: "id",
            slug: "vdp_scroll_depth",
            name: "VDP Scroll Depth",
            concept_id: null,
            unit: "percent",
            good_direction: "higher",
            description: "",
            created_at: "",
          },
        ],
      });
    const metric = await createMetric({
      slug: "vdp_scroll_depth",
      name: "VDP Scroll Depth",
      unit: "percent",
      good_direction: "higher",
    });
    expect(metric.slug).toBe("vdp_scroll_depth");
  });
});

describe("upsertMetricBySlug", () => {
  test("uses ON CONFLICT (slug)", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: "id",
          slug: "vdp_scroll",
          name: "x",
          concept_id: null,
          unit: null,
          good_direction: null,
          description: null,
          created_at: "",
        },
      ],
    });
    await upsertMetricBySlug({ slug: "vdp_scroll", name: "x" });
    expect(mockQuery.mock.calls[0][0]).toMatch(/ON CONFLICT \(slug\) DO UPDATE/);
  });
});

describe("patchMetric", () => {
  test("rejects bad good_direction", async () => {
    await expect(
      patchMetric("11111111-1111-1111-1111-111111111111", {
        good_direction: "left" as any,
      }),
    ).rejects.toBeInstanceOf(LiteracyValidationError);
  });
});

describe("deleteMetric", () => {
  test("returns false when nothing deleted", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const ok = await deleteMetric("11111111-1111-1111-1111-111111111111");
    expect(ok).toBe(false);
  });
});
