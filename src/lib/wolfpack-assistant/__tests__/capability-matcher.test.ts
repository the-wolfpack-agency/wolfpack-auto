/**
 * Unit tests for wolfpack-assistant/capability-matcher.ts.
 *
 * Validates the role × action gate + the deterministic prompt scorer.
 */

import {
  canRoleInvoke,
  matchActions,
  scoreAction,
  tokenize,
} from "../capability-matcher";
import type { AssistantAction } from "../types";

function mkAction(overrides: Partial<AssistantAction>): AssistantAction {
  return {
    id: "id",
    slug: "leads.update_routing_rule",
    display_name: "Update lead routing",
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

describe("canRoleInvoke", () => {
  test("true when role is in allowed_roles", () => {
    expect(canRoleInvoke(mkAction({ allowed_roles: ["gm", "admin"] }), "gm")).toBe(true);
  });

  test("true when allowed_roles includes 'any'", () => {
    expect(canRoleInvoke(mkAction({ allowed_roles: ["any"] }), "salesperson")).toBe(true);
  });

  test("false when role not in allowed_roles", () => {
    expect(canRoleInvoke(mkAction({ allowed_roles: ["gm"] }), "salesperson")).toBe(false);
  });

  test("false when action is inactive", () => {
    expect(canRoleInvoke(mkAction({ active: false, allowed_roles: ["gm"] }), "gm")).toBe(false);
  });

  test("false when allowed_roles is empty", () => {
    expect(canRoleInvoke(mkAction({ allowed_roles: [] }), "gm")).toBe(false);
  });

  test("capability override can opt-out an otherwise allowed role", () => {
    expect(
      canRoleInvoke(
        mkAction({ allowed_roles: ["gm"] }),
        "gm",
        [{ role: "gm", enabled: false }],
      ),
    ).toBe(false);
  });
});

describe("tokenize", () => {
  test("drops stopwords + short tokens", () => {
    expect(tokenize("I want to update my lead routing")).toEqual([
      "want", "update", "lead", "routing",
    ]);
  });
  test("lowercases", () => {
    expect(tokenize("ROUTING")).toEqual(["routing"]);
  });
  test("handles empty input", () => {
    expect(tokenize("")).toEqual([]);
  });
});

describe("scoreAction", () => {
  test("returns 0 for empty prompt", () => {
    expect(scoreAction("", mkAction({}))).toBe(0);
  });

  test("higher score when prompt overlaps the slug tokens", () => {
    const high = scoreAction(
      "update lead routing for my team",
      mkAction({ slug: "leads.update_routing_rule" }),
    );
    const low = scoreAction(
      "schedule a service appointment",
      mkAction({ slug: "leads.update_routing_rule" }),
    );
    expect(high).toBeGreaterThan(low);
  });

  test("never exceeds 1.0", () => {
    const s = scoreAction(
      "update lead routing routing routing routing",
      mkAction({ slug: "leads.update_routing_rule", display_name: "Update lead routing" }),
    );
    expect(s).toBeLessThanOrEqual(1);
    expect(s).toBeGreaterThan(0);
  });
});

describe("matchActions", () => {
  const ACTIONS: AssistantAction[] = [
    mkAction({
      slug: "leads.update_routing_rule",
      display_name: "Update lead routing",
      description: "Change which sales rep gets which new leads.",
      allowed_roles: ["gm", "sales_manager", "admin"],
    }),
    mkAction({
      slug: "service.update_hours",
      display_name: "Update service hours",
      description: "Update the service department operating hours.",
      allowed_roles: ["service_manager", "gm", "admin"],
      category: "service",
    }),
    mkAction({
      slug: "fi.reorder_product_menu",
      display_name: "Reorder F&I product menu",
      description: "Reorder the F&I product menu.",
      allowed_roles: ["fi_manager"],
      category: "fi",
    }),
  ];

  test("returns top matches above minConfidence", () => {
    const out = matchActions("update lead routing", "gm", ACTIONS);
    expect(out.length).toBeGreaterThan(0);
    expect(out[0].slug).toBe("leads.update_routing_rule");
  });

  test("filters by role: F&I action is hidden from a salesperson", () => {
    const out = matchActions("reorder the F I product menu", "salesperson", ACTIONS);
    const slugs = out.map((m) => m.slug);
    expect(slugs).not.toContain("fi.reorder_product_menu");
  });

  test("returns empty when nothing scores above threshold", () => {
    const out = matchActions("xenoblade chronicles", "gm", ACTIONS);
    expect(out).toEqual([]);
  });

  test("respects limit option", () => {
    const out = matchActions("update", "admin", ACTIONS, { limit: 1 });
    expect(out).toHaveLength(1);
  });

  test("is deterministic — same inputs produce identical output", () => {
    const a = matchActions("update lead routing", "gm", ACTIONS);
    const b = matchActions("update lead routing", "gm", ACTIONS);
    expect(b).toEqual(a);
  });
});
