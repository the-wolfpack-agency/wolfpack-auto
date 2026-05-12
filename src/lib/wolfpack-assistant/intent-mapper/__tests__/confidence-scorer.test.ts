/**
 * Unit tests for intent-mapper/confidence-scorer.ts.
 *
 * Deterministic input → output checks. These are the regression bars
 * for tuning: change a weight, expect at least one assertion to move.
 */

import { combineConfidence, isAmbiguous } from "../confidence-scorer";
import type { AssistantAction } from "../../types";

function mkAction(overrides: Partial<AssistantAction> = {}): AssistantAction {
  return {
    id: "id",
    slug: "x.y",
    display_name: "X",
    description: "X",
    parameter_schema: {},
    allowed_roles: ["gm"],
    side_effect: "mutating",
    dry_run_supported: true,
    category: "general",
    vertical: "any",
    active: true,
    created_at: "",
    updated_at: "",
    ...overrides,
  };
}

describe("combineConfidence", () => {
  test("role-disallowed → 0", () => {
    expect(combineConfidence({
      keyword: 1, patternHit: true, paramBoost: 1,
      action: mkAction({ allowed_roles: ["fi_manager"] }),
      role: "salesperson",
    })).toBe(0);
  });
  test("inactive action → 0", () => {
    expect(combineConfidence({
      keyword: 1, patternHit: true, paramBoost: 1,
      action: mkAction({ active: false }),
      role: "gm",
    })).toBe(0);
  });
  test("keyword 0.5 only → 0.275 (KEYWORD_BASE 0.55)", () => {
    const c = combineConfidence({
      keyword: 0.5, patternHit: false, paramBoost: 0,
      action: mkAction(), role: "gm",
    });
    expect(c).toBeCloseTo(0.275, 2);
  });
  test("keyword 0.5 + pattern hit → 0.625", () => {
    const c = combineConfidence({
      keyword: 0.5, patternHit: true, paramBoost: 0,
      action: mkAction(), role: "gm",
    });
    expect(c).toBeCloseTo(0.625, 2);
  });
  test("keyword 0.6 + pattern hit + param boosts → ~0.93", () => {
    const c = combineConfidence({
      keyword: 0.6, patternHit: true, paramBoost: 0.25,
      action: mkAction(), role: "gm",
    });
    expect(c).toBeGreaterThan(0.9);
    expect(c).toBeLessThanOrEqual(1);
  });
  test("paramBoost is capped (no runaway)", () => {
    const c = combineConfidence({
      keyword: 0, patternHit: false, paramBoost: 99,
      action: mkAction(), role: "gm",
    });
    expect(c).toBeLessThanOrEqual(0.26); // PARAM_CAP 0.25 plus rounding slack
  });
  test("clamped to [0, 1]", () => {
    const c = combineConfidence({
      keyword: 1, patternHit: true, paramBoost: 1,
      action: mkAction(), role: "gm",
    });
    expect(c).toBeLessThanOrEqual(1);
    expect(c).toBeGreaterThanOrEqual(0);
  });
});

describe("isAmbiguous", () => {
  test("false for 0 or 1 matches", () => {
    expect(isAmbiguous([], 0.1)).toBe(false);
    expect(isAmbiguous([{ confidence: 0.8 }], 0.1)).toBe(false);
  });
  test("true when top 2 within threshold", () => {
    expect(isAmbiguous([
      { confidence: 0.8 }, { confidence: 0.75 },
    ], 0.1)).toBe(true);
  });
  test("false when top 2 outside threshold", () => {
    expect(isAmbiguous([
      { confidence: 0.9 }, { confidence: 0.4 },
    ], 0.1)).toBe(false);
  });
  test("threshold boundary inclusive", () => {
    expect(isAmbiguous([
      { confidence: 0.8 }, { confidence: 0.7 },
    ], 0.1)).toBe(true);
  });
});
