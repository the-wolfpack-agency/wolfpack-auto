/**
 * Unit tests for intent-mapper/keyword-matcher.ts.
 *
 * Validates per-action scoring + the short-prompt regression fix that
 * keeps 1-token prompts from collapsing to ~0.
 */

import { scoreAllActions, scoreKeywords } from "../keyword-matcher";
import { tokenize } from "../tokenizer";
import type { AssistantAction } from "../../types";

function mkAction(overrides: Partial<AssistantAction>): AssistantAction {
  return {
    id: "id",
    slug: "leads.update_routing_rule",
    display_name: "Update lead routing rule",
    description: "Change which sales rep gets which new leads.",
    parameter_schema: {},
    allowed_roles: ["gm"],
    side_effect: "mutating",
    dry_run_supported: true,
    category: "leads",
    active: true,
    created_at: "",
    updated_at: "",
    ...overrides,
  };
}

describe("scoreKeywords", () => {
  test("empty prompt scores 0", () => {
    const { score } = scoreKeywords([], mkAction({}));
    expect(score).toBe(0);
  });

  test("strong slug match wins (multi-token)", () => {
    const tokens = tokenize("update lead routing for my team");
    const { score, matchedTokens } = scoreKeywords(
      tokens,
      mkAction({ slug: "leads.update_routing_rule" }),
    );
    expect(score).toBeGreaterThan(0.5);
    expect(matchedTokens).toContain("update");
    expect(matchedTokens).toContain("routing");
  });

  test("single slug-token match clears MIN_MATCH_CONFIDENCE (0.15)", () => {
    const tokens = tokenize("routing");
    const { score } = scoreKeywords(
      tokens,
      mkAction({ slug: "leads.update_routing_rule" }),
    );
    expect(score).toBeGreaterThanOrEqual(0.15);
  });

  test("never exceeds 1.0", () => {
    const tokens = tokenize("update lead routing routing routing routing");
    const { score } = scoreKeywords(
      tokens,
      mkAction({ slug: "leads.update_routing_rule" }),
    );
    expect(score).toBeLessThanOrEqual(1);
  });

  test("zero match returns 0", () => {
    const tokens = tokenize("xenoblade chronicles");
    const { score } = scoreKeywords(tokens, mkAction({}));
    expect(score).toBe(0);
  });

  test("description-only match scores lower than slug+description match", () => {
    const tokens = tokenize("change sales rep");
    const slugOnly = scoreKeywords(
      tokens,
      mkAction({
        slug: "totally.unrelated",
        display_name: "Totally unrelated",
        description: "Change which sales rep gets the lead.",
      }),
    );
    const slugAndDesc = scoreKeywords(
      tokens,
      mkAction({ slug: "change_rep" }),
    );
    expect(slugAndDesc.score).toBeGreaterThan(slugOnly.score);
  });
});

describe("scoreAllActions", () => {
  const ACTIONS: AssistantAction[] = [
    mkAction({ slug: "leads.update_routing_rule" }),
    mkAction({
      slug: "service.update_hours",
      display_name: "Update service hours",
      description: "Update the service department operating hours.",
    }),
    mkAction({
      slug: "fi.reorder_product_menu",
      display_name: "Reorder F&I product menu",
      description: "Reorder the F&I product menu.",
    }),
  ];

  test("returns descending by score", () => {
    const out = scoreAllActions("update lead routing", ACTIONS);
    expect(out[0].score).toBeGreaterThanOrEqual(out[1].score);
    expect(out[1].score).toBeGreaterThanOrEqual(out[2].score);
  });

  test("right action wins for 'update lead routing'", () => {
    const out = scoreAllActions("update lead routing", ACTIONS);
    expect(out[0].action.slug).toBe("leads.update_routing_rule");
  });

  test("right action wins for 'update service hours'", () => {
    const out = scoreAllActions("update service hours", ACTIONS);
    expect(out[0].action.slug).toBe("service.update_hours");
  });

  test("right action wins for 'reorder F&I menu'", () => {
    const out = scoreAllActions("reorder F&I menu", ACTIONS);
    expect(out[0].action.slug).toBe("fi.reorder_product_menu");
  });
});
