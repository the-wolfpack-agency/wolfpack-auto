/* eslint-disable @typescript-eslint/no-explicit-any */
const mockQuery = jest.fn();
jest.mock("@/lib/db", () => ({
  query: (...a: any[]) => mockQuery(...a),
  pool: { connect: jest.fn(), query: jest.fn(), end: jest.fn() },
}));

import {
  recordOutcome,
  listOutcomes,
  getTranslationQualitySignal,
} from "../outcomes";
import { LiteracyValidationError } from "../concepts";

beforeEach(() => {
  mockQuery.mockReset();
  process.env.DATABASE_URL = "postgres://test";
});
afterEach(() => {
  delete process.env.DATABASE_URL;
});

const DEALER = "00000000-0000-4000-a000-000000000001";

describe("recordOutcome validation", () => {
  test("rejects bad dealer_id", async () => {
    await expect(
      recordOutcome({
        dealer_id: "not-a-uuid",
        translation_id: "33333333-3333-3333-3333-333333333333",
      }),
    ).rejects.toBeInstanceOf(LiteracyValidationError);
  });

  test("rejects when both translation_id and action_id are missing", async () => {
    await expect(
      recordOutcome({ dealer_id: DEALER }),
    ).rejects.toBeInstanceOf(LiteracyValidationError);
  });
});

describe("recordOutcome happy path", () => {
  test("inserts a row with the supplied flags", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: "id",
          dealer_id: DEALER,
          translation_id: "33333333-3333-3333-3333-333333333333",
          action_id: null,
          rendered_at: "",
          was_clicked: true,
          was_acted_on: null,
          metric_delta: null,
          recorded_at: "",
        },
      ],
    });
    const row = await recordOutcome({
      dealer_id: DEALER,
      translation_id: "33333333-3333-3333-3333-333333333333",
      was_clicked: true,
    });
    expect(row.was_clicked).toBe(true);
  });
});

describe("listOutcomes", () => {
  test("rejects bad dealer_id", async () => {
    await expect(
      listOutcomes({ dealer_id: "nope" }),
    ).rejects.toBeInstanceOf(LiteracyValidationError);
  });

  test("filters on dealer_id only by default", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    await listOutcomes({ dealer_id: DEALER });
    expect(mockQuery.mock.calls[0][0]).toMatch(/WHERE dealer_id = \$1/);
  });
});

describe("getTranslationQualitySignal", () => {
  test("returns zero-rows shape when no outcomes recorded", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ rendered: 0, clicked: 0, acted_on: 0 }],
    });
    const signal = await getTranslationQualitySignal(
      "33333333-3333-3333-3333-333333333333",
    );
    expect(signal).toEqual({ rendered: 0, clicked: 0, acted_on: 0 });
  });
});
