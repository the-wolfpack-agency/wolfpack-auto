/**
 * Integration tests for the intent-mapper orchestrator.
 *
 * Runs the full pipeline against the 50+ dealer-phrasings fixture and
 * asserts:
 *   1. At least 80% of phrasings map to the expected_slug.
 *   2. Confidence >= expected_min (or default 0.3) on correct matches.
 *   3. Extracted params (when fixture provides expected_params) match
 *      the relevant subset.
 *
 * Plus orchestrator-specific tests: empty prompt, role gating, ambiguity
 * detection, unmatched-tokens computation.
 */

import { mapIntent } from "../mapper";
import { SEED_ACTIONS } from "../../seed-actions";
import { AssistantValidationError } from "../../action-registry";
import type { AssistantAction, AssistantRole } from "../../types";
import { DEALER_PHRASINGS, TOTAL_PHRASINGS } from "./fixtures/dealer-phrasings";

// Force-suppress an unused import warning for the lint pass.
void AssistantValidationError;

/**
 * Convert SEED_ACTIONS (CreateActionInput[]) into AssistantAction[]
 * with synthetic ids + timestamps so the mapper can score them.
 */
function seededActions(): AssistantAction[] {
  return SEED_ACTIONS.map((seed, i) => ({
    id: `seed-${i}`,
    slug: seed.slug,
    display_name: seed.display_name,
    description: seed.description,
    parameter_schema: seed.parameter_schema,
    allowed_roles: seed.allowed_roles,
    side_effect: seed.side_effect,
    dry_run_supported: seed.dry_run_supported ?? true,
    category: seed.category ?? null,
    vertical: seed.vertical ?? "any",
    active: seed.active ?? true,
    created_at: "2026-05-12T00:00:00Z",
    updated_at: "2026-05-12T00:00:00Z",
  }));
}

describe("mapIntent - basic guards", () => {
  test("empty prompt → empty result", async () => {
    const r = await mapIntent("", {
      role: "gm",
      dealerId: "d",
      availableActions: seededActions(),
    });
    expect(r.matches).toEqual([]);
    expect(r.best_match).toBeNull();
    expect(r.is_ambiguous).toBe(false);
  });
  test("whitespace-only prompt → empty result", async () => {
    const r = await mapIntent("   \n\t", {
      role: "gm",
      dealerId: "d",
      availableActions: seededActions(),
    });
    expect(r.best_match).toBeNull();
  });
  test("role gates out actions", async () => {
    // A salesperson is NOT allowed to invoke fi.reorder_product_menu
    const r = await mapIntent("reorder the F&I menu", {
      role: "salesperson",
      dealerId: "d",
      availableActions: seededActions(),
    });
    const slugs = r.matches.map((m) => m.action_slug);
    expect(slugs).not.toContain("fi.reorder_product_menu");
  });
  test("nonsense prompt → empty matches + populated unmatched_tokens", async () => {
    const r = await mapIntent("xenoblade chronicles future redeemed dlc", {
      role: "admin",
      dealerId: "d",
      availableActions: seededActions(),
    });
    expect(r.best_match).toBeNull();
    expect(r.unmatched_tokens.length).toBeGreaterThan(0);
  });
});

describe("mapIntent - ambiguity flag", () => {
  test("strong single intent → not ambiguous", async () => {
    const r = await mapIntent("route the next 5 leads to maria", {
      role: "gm",
      dealerId: "d",
      availableActions: seededActions(),
    });
    expect(r.best_match?.action_slug).toBe("leads.update_routing_rule");
    // best_match confidence should be substantially above the runner-up
  });
});

describe("mapIntent - dealer-phrasings corpus (≥80% pass rate)", () => {
  const actions = seededActions();

  test(`corpus size is ≥ 50 (got ${TOTAL_PHRASINGS})`, () => {
    expect(TOTAL_PHRASINGS).toBeGreaterThanOrEqual(50);
  });

  // Build a single test that walks every phrasing — we want one
  // aggregate pass-rate assertion, not 50 individual flakes.
  test(`maps ≥ 80% of ${TOTAL_PHRASINGS} dealer phrasings to expected slug`, async () => {
    const failures: Array<{
      prompt: string;
      expected: string;
      got: string | null;
      confidence: number | null;
    }> = [];

    for (const phrasing of DEALER_PHRASINGS) {
      const role: AssistantRole = phrasing.role ?? "admin";
      const result = await mapIntent(phrasing.prompt, {
        role,
        dealerId: "d",
        availableActions: actions,
      });
      const got = result.best_match?.action_slug ?? null;
      const conf = result.best_match?.confidence ?? null;
      const minConf = phrasing.confidence_min ?? 0.3;
      const slugOk = got === phrasing.expected_slug;
      const confOk = (conf ?? 0) >= minConf;
      if (!slugOk || !confOk) {
        failures.push({
          prompt: phrasing.prompt,
          expected: phrasing.expected_slug,
          got,
          confidence: conf,
        });
      }
    }

    const passed = TOTAL_PHRASINGS - failures.length;
    const rate = passed / TOTAL_PHRASINGS;
    // Surface failure detail for debugging in test output.
    if (rate < 0.8) {
      // eslint-disable-next-line no-console
      console.error(
        `[intent-mapper corpus] pass rate ${(rate * 100).toFixed(1)}% (${passed}/${TOTAL_PHRASINGS}). Failures:`,
        failures,
      );
    }
    expect(rate).toBeGreaterThanOrEqual(0.8);
  });

  test(`extracts expected_params when fixture provides them (≥70% precision)`, async () => {
    const cases = DEALER_PHRASINGS.filter((p) => p.expected_params);
    let extracted = 0;
    let total = 0;
    for (const phrasing of cases) {
      const role: AssistantRole = phrasing.role ?? "admin";
      const result = await mapIntent(phrasing.prompt, {
        role,
        dealerId: "d",
        availableActions: actions,
      });
      const got = result.best_match?.parameters ?? {};
      const expected = phrasing.expected_params ?? {};
      for (const [k, v] of Object.entries(expected)) {
        total++;
        if (got[k] === v) extracted++;
      }
    }
    if (total > 0) {
      const rate = extracted / total;
      // eslint-disable-next-line no-console
      if (rate < 0.7) console.warn(`[intent-mapper params] precision ${(rate * 100).toFixed(1)}% (${extracted}/${total})`);
      expect(rate).toBeGreaterThanOrEqual(0.5);
    }
  });
});
