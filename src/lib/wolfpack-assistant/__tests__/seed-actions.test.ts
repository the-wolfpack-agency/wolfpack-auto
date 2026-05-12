/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Data-shape + idempotence tests for the SEED_ACTIONS list.
 */

const mockQuery = jest.fn();
jest.mock("@/lib/db", () => ({
  query: (...a: any[]) => mockQuery(...a),
  pool: { connect: jest.fn(), query: jest.fn(), end: jest.fn() },
}));

import {
  SEED_ACTIONS,
  seedAssistantActions,
} from "../seed-actions";
import {
  ASSISTANT_SIDE_EFFECTS,
  ASSISTANT_SLUG_PATTERN,
  ASSISTANT_VERTICALS,
} from "../types";

describe("SEED_ACTIONS data shape", () => {
  test("ships 15 to 25 starter actions", () => {
    expect(SEED_ACTIONS.length).toBeGreaterThanOrEqual(15);
    expect(SEED_ACTIONS.length).toBeLessThanOrEqual(25);
  });

  test("every slug matches the slug pattern", () => {
    for (const a of SEED_ACTIONS) {
      expect(a.slug).toMatch(ASSISTANT_SLUG_PATTERN);
    }
  });

  test("slugs are unique", () => {
    const set = new Set(SEED_ACTIONS.map((a) => a.slug));
    expect(set.size).toBe(SEED_ACTIONS.length);
  });

  test("every action declares a valid side_effect", () => {
    for (const a of SEED_ACTIONS) {
      expect(ASSISTANT_SIDE_EFFECTS).toContain(a.side_effect);
    }
  });

  test("every action has at least one allowed role", () => {
    for (const a of SEED_ACTIONS) {
      expect(a.allowed_roles.length).toBeGreaterThan(0);
    }
  });

  test("every action has a non-empty description", () => {
    for (const a of SEED_ACTIONS) {
      expect(a.description.trim().length).toBeGreaterThan(5);
    }
  });

  test("starter set covers at least 6 categories", () => {
    const categories = new Set(SEED_ACTIONS.map((a) => a.category ?? "general"));
    expect(categories.size).toBeGreaterThanOrEqual(6);
  });

  test("contains the required canonical actions", () => {
    const slugs = new Set(SEED_ACTIONS.map((a) => a.slug));
    for (const required of [
      "leads.update_routing_rule",
      "fi.reorder_product_menu",
      "service.update_hours",
      "notifications.mute_after_hours",
      "analytics.show_my_funnel",
    ]) {
      expect(slugs.has(required)).toBe(true);
    }
  });
});

describe("SEED_ACTIONS vertical tagging (migration 080)", () => {
  test("every seed action declares a vertical", () => {
    for (const a of SEED_ACTIONS) {
      expect(a.vertical).toBeDefined();
      expect(ASSISTANT_VERTICALS).toContain(a.vertical);
    }
  });

  test("auto-vertical seeds cover leads, fi, service, inventory, audit", () => {
    const autoSlugs = SEED_ACTIONS
      .filter((a) => a.vertical === "auto")
      .map((a) => a.slug);
    expect(autoSlugs).toContain("leads.update_routing_rule");
    expect(autoSlugs).toContain("leads.assign_lead");
    expect(autoSlugs).toContain("fi.reorder_product_menu");
    expect(autoSlugs).toContain("fi.set_attach_target");
    expect(autoSlugs).toContain("audit.run_fi_penetration");
    expect(autoSlugs).toContain("service.update_hours");
    expect(autoSlugs).toContain("service.add_special_closure");
    expect(autoSlugs).toContain("inventory.feature_vehicle");
    expect(autoSlugs).toContain("inventory.adjust_price");
  });

  test("any-vertical seeds cover email, notifications, analytics, learning, general", () => {
    const anySlugs = SEED_ACTIONS
      .filter((a) => a.vertical === "any")
      .map((a) => a.slug);
    expect(anySlugs).toContain("email.draft_followup");
    expect(anySlugs).toContain("notifications.mute_after_hours");
    expect(anySlugs).toContain("notifications.subscribe_alert");
    expect(anySlugs).toContain("analytics.show_my_funnel");
    expect(anySlugs).toContain("analytics.compare_to_peer");
    expect(anySlugs).toContain("learning.suggest_training");
    expect(anySlugs).toContain("learning.explain_metric");
    expect(anySlugs).toContain("general.update_my_profile");
  });

  test("vertical distribution: 9 auto + 8 any (no retail/service/hospitality seeds yet)", () => {
    const dist: Record<string, number> = {};
    for (const a of SEED_ACTIONS) {
      const v = a.vertical ?? "any";
      dist[v] = (dist[v] ?? 0) + 1;
    }
    expect(dist.auto).toBe(9);
    expect(dist.any).toBe(8);
    expect(dist.retail ?? 0).toBe(0);
    expect(dist.hospitality ?? 0).toBe(0);
  });

  test("seed re-run is idempotent at the vertical level (upsert overwrites)", async () => {
    process.env.DATABASE_URL = "postgres://test";
    mockQuery.mockReset();
    mockQuery.mockImplementation((sql: string, params: unknown[]) => {
      if (typeof sql === "string" && sql.includes("INSERT INTO assistant_actions")) {
        return Promise.resolve({
          rows: [
            {
              id: `action-${params[0]}`,
              slug: params[0],
              display_name: params[1],
              description: params[2],
              parameter_schema: params[3],
              allowed_roles: params[4],
              side_effect: params[5],
              dry_run_supported: params[6],
              category: params[7],
              vertical: params[8],
              active: params[9],
              created_at: "",
              updated_at: "",
            },
          ],
        });
      }
      return Promise.resolve({ rows: [] });
    });
    await seedAssistantActions();
    const inserts = mockQuery.mock.calls.filter(
      (c) => typeof c[0] === "string" && c[0].includes("INSERT INTO assistant_actions"),
    );
    // Every insert carries the vertical column in slot 8 (0-indexed).
    for (const c of inserts) {
      expect(ASSISTANT_VERTICALS).toContain(c[1][8]);
    }
    delete process.env.DATABASE_URL;
  });
});

describe("seedAssistantActions — upsert idempotence", () => {
  beforeEach(() => {
    mockQuery.mockReset();
    process.env.DATABASE_URL = "postgres://test";
    mockQuery.mockImplementation((sql: string, params: unknown[]) => {
      if (typeof sql === "string" && sql.includes("INSERT INTO assistant_actions")) {
        return Promise.resolve({
          rows: [
            {
              id: `action-${params[0]}`,
              slug: params[0],
              display_name: params[1],
              description: params[2],
              parameter_schema: params[3],
              allowed_roles: params[4],
              side_effect: params[5],
              dry_run_supported: params[6],
              category: params[7],
              active: params[8],
              created_at: "",
              updated_at: "",
            },
          ],
        });
      }
      return Promise.resolve({ rows: [] });
    });
  });

  afterEach(() => {
    delete process.env.DATABASE_URL;
  });

  test("running the seed once writes the expected count", async () => {
    const result = await seedAssistantActions();
    expect(result.actions).toBe(SEED_ACTIONS.length);
  });

  test("every upsert uses ON CONFLICT (slug) DO UPDATE", async () => {
    await seedAssistantActions();
    const inserts = mockQuery.mock.calls.filter(
      (c) => typeof c[0] === "string" && c[0].includes("INSERT INTO assistant_actions"),
    );
    expect(inserts.length).toBe(SEED_ACTIONS.length);
    for (const c of inserts) {
      expect(c[0]).toMatch(/ON CONFLICT \(slug\) DO UPDATE/);
    }
  });

  test("running the seed twice produces identical write counts (no duplicates)", async () => {
    const first = await seedAssistantActions();
    const callsFirstRun = mockQuery.mock.calls.length;
    const second = await seedAssistantActions();
    const callsSecondRun = mockQuery.mock.calls.length - callsFirstRun;
    expect(second).toEqual(first);
    expect(callsSecondRun).toBe(callsFirstRun);
  });

  test("throws clearly when DATABASE_URL is unset", async () => {
    delete process.env.DATABASE_URL;
    await expect(seedAssistantActions()).rejects.toThrow(/DATABASE_URL/);
  });
});
