/**
 * Unit tests for src/lib/literacy-walkthroughs/expansion.ts.
 *
 * The expansion module is the in-platform-literacy mirror of the migration
 * 075 ontology expansion stub. Asserts:
 *   - deterministic output (same input → same output)
 *   - shape contract (slug, role, steps with required fields)
 *   - source marker is always 'ai_proposed'
 *   - TODO(llm-provider) marker survives in rationale
 *   - invalid role / surface fall back safely
 */

import { proposeWalkthrough, proposeTooltip } from "../expansion";

describe("proposeWalkthrough (stub)", () => {
  test("returns the documented shape for a role + surface", async () => {
    const out = await proposeWalkthrough("fi_manager", "dashboard");
    expect(out.role).toBe("fi_manager");
    expect(out.surface).toBe("dashboard");
    expect(out.source).toBe("ai_proposed");
    expect(out.trigger_condition).toBe("first_visit");
    expect(out.steps).toHaveLength(3);
    out.steps.forEach((s) => {
      expect(typeof s.selector).toBe("string");
      expect(typeof s.template).toBe("string");
      expect(s.template.length).toBeGreaterThan(0);
    });
    expect(out.rationale).toMatch(/TODO\(llm-provider\)/);
  });

  test("is deterministic for repeated calls", async () => {
    const a = await proposeWalkthrough("salesperson", "dashboard");
    const b = await proposeWalkthrough("salesperson", "dashboard");
    expect(a).toEqual(b);
  });

  test("falls back to 'dashboard' when surface is blank", async () => {
    const out = await proposeWalkthrough("controller", "");
    expect(out.surface).toBe("dashboard");
    expect(out.slug).toContain("dashboard");
  });

  test("rejects invalid role", async () => {
    await expect(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      proposeWalkthrough("not-a-real-role" as any, "dashboard"),
    ).rejects.toThrow();
  });
});

describe("proposeTooltip (stub)", () => {
  test("returns 1-sentence short_text + multi-sentence expanded_text", async () => {
    const out = await proposeTooltip("vdp_scroll_depth", "salesperson");
    expect(out.concept_slug).toBe("vdp_scroll_depth");
    expect(out.role).toBe("salesperson");
    expect(out.source).toBe("ai_proposed");
    expect(out.short_text.length).toBeGreaterThan(0);
    expect(out.expanded_text.length).toBeGreaterThan(out.short_text.length);
    expect(out.rationale).toMatch(/TODO\(llm-provider\)/);
  });

  test("is deterministic for repeated calls", async () => {
    const a = await proposeTooltip("vdp", "fi_manager");
    const b = await proposeTooltip("vdp", "fi_manager");
    expect(a).toEqual(b);
  });

  test("rejects invalid role", async () => {
    await expect(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      proposeTooltip("vdp", "ceo" as any),
    ).rejects.toThrow();
  });
});
