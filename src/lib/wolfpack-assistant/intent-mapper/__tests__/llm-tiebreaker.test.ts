/**
 * Unit tests for intent-mapper/llm-tiebreaker.ts (stub).
 *
 * Validates deterministic stub behavior. When the real LLM-backed
 * implementation lands, these tests will need to update to mock the
 * gateway call.
 */

import { resolveTiebreak, resolveTiebreakSync } from "../llm-tiebreaker";
import type { IntentMatch } from "../types";

function mk(slug: string, conf: number): IntentMatch {
  return {
    action_slug: slug,
    confidence: conf,
    parameters: {},
    reasoning: "test",
    source: "keyword",
  };
}

describe("resolveTiebreakSync", () => {
  test("empty competing → null", () => {
    expect(resolveTiebreakSync({ prompt: "x", competing: [] })).toBeNull();
  });
  test("single competing → returned unchanged", () => {
    const m = mk("a", 0.5);
    expect(resolveTiebreakSync({ prompt: "x", competing: [m] })).toEqual(m);
  });
  test("multiple → highest confidence wins", () => {
    const a = mk("a.action", 0.6);
    const b = mk("b.action", 0.8);
    const c = mk("c.action", 0.7);
    const out = resolveTiebreakSync({ prompt: "x", competing: [a, b, c] });
    expect(out?.action_slug).toBe("b.action");
  });
  test("ties broken by slug alphabetical for stability", () => {
    const a = mk("z.action", 0.7);
    const b = mk("a.action", 0.7);
    const out = resolveTiebreakSync({ prompt: "x", competing: [a, b] });
    expect(out?.action_slug).toBe("a.action");
  });
  test("annotates reasoning with TODO marker", () => {
    const a = mk("a", 0.6);
    const b = mk("b", 0.5);
    const out = resolveTiebreakSync({ prompt: "x", competing: [a, b] });
    expect(out?.reasoning).toMatch(/TODO\(llm-tiebreaker\)/);
  });
  test("deterministic — same input → same output", () => {
    const a = mk("a", 0.6);
    const b = mk("b", 0.5);
    expect(resolveTiebreakSync({ prompt: "x", competing: [a, b] })).toEqual(
      resolveTiebreakSync({ prompt: "x", competing: [a, b] }),
    );
  });
});

describe("resolveTiebreak (async)", () => {
  test("matches sync behavior", async () => {
    const a = mk("a", 0.6);
    const b = mk("b", 0.7);
    const out = await resolveTiebreak({ prompt: "x", competing: [a, b] });
    const sync = resolveTiebreakSync({ prompt: "x", competing: [a, b] });
    expect(out).toEqual(sync);
  });
});
