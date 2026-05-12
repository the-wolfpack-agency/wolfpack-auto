/* eslint-disable @typescript-eslint/no-explicit-any */
const mockQuery = jest.fn();
jest.mock("@/lib/db", () => ({
  query: (...a: any[]) => mockQuery(...a),
  pool: { connect: jest.fn(), query: jest.fn(), end: jest.fn() },
}));

import { proposeMappings, proposeTranslations } from "../expansion";

beforeEach(() => {
  mockQuery.mockReset();
});

afterEach(() => {
  delete process.env.DATABASE_URL;
});

describe("proposeMappings (stub)", () => {
  test("returns up to `limit` proposals when DATABASE_URL is unset (no concept lookup)", async () => {
    const proposals = await proposeMappings("vdp", { limit: 2 });
    expect(proposals).toHaveLength(2);
    expect(proposals.every((p) => p.source === "ai_proposed")).toBe(true);
    expect(proposals.every((p) => p.rationale.includes("TODO(llm-provider)"))).toBe(true);
  });

  test("returns [] when concept lookup fails", async () => {
    process.env.DATABASE_URL = "postgres://test";
    mockQuery.mockResolvedValueOnce({ rows: [] }); // concept not found
    const proposals = await proposeMappings("unknown_slug");
    expect(proposals).toEqual([]);
  });
});

describe("proposeTranslations (stub)", () => {
  test("returns up to `limit` proposals with role + metric slug", async () => {
    const proposals = await proposeTranslations("vdp_scroll_depth", "salesperson", {
      limit: 3,
    });
    expect(proposals).toHaveLength(3);
    expect(proposals.every((p) => p.role === "salesperson")).toBe(true);
    expect(proposals.every((p) => p.metric_slug === "vdp_scroll_depth")).toBe(true);
    expect(proposals.every((p) => p.source === "ai_proposed")).toBe(true);
  });

  test("returns [] when metric lookup fails", async () => {
    process.env.DATABASE_URL = "postgres://test";
    mockQuery.mockResolvedValueOnce({ rows: [] }); // metric not found
    const proposals = await proposeTranslations("unknown_metric", "fi_manager");
    expect(proposals).toEqual([]);
  });
});
