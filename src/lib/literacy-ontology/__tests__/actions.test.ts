/* eslint-disable @typescript-eslint/no-explicit-any */
const mockQuery = jest.fn();
jest.mock("@/lib/db", () => ({
  query: (...a: any[]) => mockQuery(...a),
  pool: { connect: jest.fn(), query: jest.fn(), end: jest.fn() },
}));

import {
  createAction,
  upsertAction,
  recommendAction,
} from "../actions";
import { LiteracyValidationError } from "../concepts";

beforeEach(() => {
  mockQuery.mockReset();
  process.env.DATABASE_URL = "postgres://test";
});
afterEach(() => {
  delete process.env.DATABASE_URL;
});

const METRIC_ID = "22222222-2222-2222-2222-222222222222";

describe("createAction validation", () => {
  test("rejects role 'any' (actions must be specific to a role)", async () => {
    await expect(
      createAction({
        metric_id: METRIC_ID,
        role: "any" as any,
        trigger_condition: "below_benchmark",
        recommendation_template: "do thing",
      }),
    ).rejects.toBeInstanceOf(LiteracyValidationError);
  });

  test("rejects empty trigger_condition", async () => {
    await expect(
      createAction({
        metric_id: METRIC_ID,
        role: "fi_manager",
        trigger_condition: "",
        recommendation_template: "do thing",
      }),
    ).rejects.toBeInstanceOf(LiteracyValidationError);
  });

  test("rejects empty recommendation_template", async () => {
    await expect(
      createAction({
        metric_id: METRIC_ID,
        role: "fi_manager",
        trigger_condition: "below_benchmark",
        recommendation_template: "  ",
      }),
    ).rejects.toBeInstanceOf(LiteracyValidationError);
  });
});

describe("upsertAction", () => {
  test("uses ON CONFLICT (metric_id, role, trigger_condition)", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: "id",
          metric_id: METRIC_ID,
          trigger_condition: "below_benchmark",
          role: "fi_manager",
          recommendation_template: "do thing",
          expected_outcome: "",
          source: "curated",
          created_at: "",
        },
      ],
    });
    await upsertAction({
      metric_id: METRIC_ID,
      role: "fi_manager",
      trigger_condition: "below_benchmark",
      recommendation_template: "do thing",
    });
    expect(mockQuery.mock.calls[0][0]).toMatch(
      /ON CONFLICT \(metric_id, role, trigger_condition\) DO UPDATE/,
    );
  });
});

describe("recommendAction", () => {
  test("returns null when no action matches", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const result = await recommendAction(METRIC_ID, "fi_manager", "missing");
    expect(result).toBeNull();
  });

  test("renders the recommendation template with variables", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: "id",
          metric_id: METRIC_ID,
          trigger_condition: "below_benchmark",
          role: "fi_manager",
          recommendation_template: "Fix the {area} gap.",
          expected_outcome: "",
          source: "curated",
          created_at: "",
        },
      ],
    });
    const result = await recommendAction(METRIC_ID, "fi_manager", "below_benchmark", {
      area: "menu",
    });
    expect(result?.rendered).toBe("Fix the menu gap.");
  });
});
