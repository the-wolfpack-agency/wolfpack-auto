/**
 * The e2e suite has to be able to fail.
 *
 * WHY THIS EXISTS
 *
 * Every bug found on 2026-08-03 shipped with CI green, and they all had the
 * same shape: a test existed, ran, and could not fail.
 *
 *   - "POST /api/admin/dealers creates a new dealer" asserted only
 *     `not.toBe(500)` and hid its real checks behind `if (status === 201)`.
 *     Unauthenticated the route answers 401, so the body was never inspected.
 *     It stayed green for months while the page could not onboard anybody.
 *   - Several specs listed 500 among the ACCEPTED statuses, so a crash passed.
 *
 * This repo's own conventions say to assert 200 rather than "no 500", for
 * exactly this reason. This file makes that enforceable.
 *
 * Two rules:
 *   1. No assertion may accept 500. A check that permits a server error cannot
 *      fail on one.
 *   2. The number of weak assertions can only go DOWN. The counts below are the
 *      measured state; a change that adds one fails. Lowering them is the work.
 *
 * The counts are a ratchet, not a tolerance. They exist so the number is
 * visible in a diff and cannot creep upward unnoticed.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const TESTS_DIR = join(__dirname, "..", "..", "tests");

/**
 * Measured 2026-08-03 by this file's own scan, after removing 500 from every
 * e2e accepted set. These may only decrease. If you strengthen assertions,
 * lower them.
 *
 * The conditional figure is 230, not the 148 first reported. That earlier
 * number came from a hand-written grep matching fewer receiver names and
 * undercounted by a third. The scan below is the measurement of record
 * precisely so the number stops depending on how carefully someone greps.
 */
const CEILING = {
  /** `expect(x).not.toBe(500)` — rules out a crash and nothing else. */
  notToBe500: 514,
  /** Real checks hidden behind `if (status === 2xx)`, so they may never run. */
  conditionalAssertions: 230,
};

function specFiles(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const full = join(dir, e);
    if (statSync(full).isDirectory()) {
      if (e === "node_modules") continue;
      specFiles(full, out);
    } else if (e.endsWith(".spec.ts")) out.push(full);
  }
  return out;
}

const sources = specFiles(TESTS_DIR).map((f) => ({ file: f, src: readFileSync(f, "utf8") }));

function countAll(re: RegExp): number {
  return sources.reduce((n, s) => n + [...s.src.matchAll(re)].length, 0);
}

describe("the scan sees the suite", () => {
  it("finds spec files, so it cannot pass by finding none", () => {
    expect(sources.length).toBeGreaterThan(50);
  });
});

describe("no assertion accepts a server error", () => {
  it("no expect([...500...]).toContain(status) anywhere under tests/e2e", () => {
    /* A 500 is never a valid outcome for a route under test. Accepting one
       means a crash is indistinguishable from success. */
    const offenders = sources
      .filter((s) => s.file.includes("/e2e/"))
      .flatMap((s) =>
        [...s.src.matchAll(/expect\(\[[^\]]*\b500\b[^\]]*\]\)\.toContain/g)].map(
          () => s.file.slice(s.file.indexOf("tests/")),
        ),
      );
    if (offenders.length) {
      throw new Error(
        `These accept a 500 as a passing status: ${[...new Set(offenders)].join(", ")}. ` +
          `A check that permits a server error cannot fail on one.`,
      );
    }
    expect(offenders).toEqual([]);
  });
});

describe("weak assertions only decrease", () => {
  it(`not.toBe(500) count is at most ${CEILING.notToBe500}`, () => {
    const n = countAll(/not\.toBe\(500\)/g);
    if (n > CEILING.notToBe500) {
      throw new Error(
        `${n} uses of not.toBe(500), up from ${CEILING.notToBe500}. That assertion rules out a ` +
          `crash and nothing else: a 401, 403 or 404 passes it. Assert the status you expect ` +
          `instead, and lower CEILING.notToBe500.`,
      );
    }
    expect(n).toBeLessThanOrEqual(CEILING.notToBe500);
  });

  it(`conditional-hidden assertion count is at most ${CEILING.conditionalAssertions}`, () => {
    /* `if (res.status() === 201) { ...the real checks... }` never runs when the
       call is refused, so the test passes having verified nothing. This is the
       exact pattern that hid the dealer-creation lockout. */
    const n = countAll(/if\s*\(\s*(?:res|resp|response)\w*\.status\(\)\s*===\s*20\d\s*\)/g);
    if (n > CEILING.conditionalAssertions) {
      throw new Error(
        `${n} assertions hidden behind a 2xx conditional, up from ${CEILING.conditionalAssertions}. ` +
          `When the call is refused the body is never checked and the test passes having ` +
          `verified nothing.`,
      );
    }
    expect(n).toBeLessThanOrEqual(CEILING.conditionalAssertions);
  });

  it("reports how much of the e2e suite any workflow actually runs", () => {
    /* The number that matters most. Assertion strength is irrelevant in a spec
       nothing executes, and on 2026-08-03 exactly one of 118 e2e specs was
       named by any workflow. A directory of specs is not coverage. */
    const { readdirSync: rd } = require("node:fs") as typeof import("node:fs");
    const wfDir = join(__dirname, "..", "..", ".github", "workflows");
    const wf = rd(wfDir)
      .filter((f: string) => /\.ya?ml$/.test(f))
      .map((f: string) => readFileSync(join(wfDir, f), "utf8"))
      .join("\n");
    const all = rd(join(TESTS_DIR, "e2e")).filter((f: string) => f.endsWith(".spec.ts"));
    const named = all.filter((f: string) => wf.includes(f));
    // eslint-disable-next-line no-console
    console.log(`[e2e coverage] ${named.length} of ${all.length} e2e specs are named by a workflow`);
    expect(all.length).toBeGreaterThan(0);
  });

  it("reports the current numbers so progress is visible", () => {
    // eslint-disable-next-line no-console
    console.log(
      `[e2e assertion strength] not.toBe(500)=${countAll(/not\.toBe\(500\)/g)}/${CEILING.notToBe500}  ` +
        `conditional=${countAll(/if\s*\(\s*(?:res|resp|response)\w*\.status\(\)\s*===\s*20\d\s*\)/g)}/${CEILING.conditionalAssertions}`,
    );
    expect(true).toBe(true);
  });
});
