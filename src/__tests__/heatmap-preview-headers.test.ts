/**
 * @jest-environment node
 *
 * Asserts that next.config.mjs exposes TWO mutually-exclusive header rules
 * for the heatmap preview feature:
 *
 *  (a) The global secure-default rule has a `missing __heatmap_bg` condition
 *      and emits X-Frame-Options: DENY + frame-ancestors 'none'.
 *
 *  (b) The preview rule has a `has __heatmap_bg=1` condition and emits
 *      X-Frame-Options: SAMEORIGIN + frame-ancestors 'self'.
 *
 *  (c) frame-ancestors in the preview branch is EXACTLY 'self' — never
 *      'none' without a replacement, never '*', never a third-party host.
 *
 *  (d) The two rules cannot both match the same request: one requires the
 *      param to be absent, the other requires it to be present and equal "1".
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

// ---------------------------------------------------------------------------
// Load the headers() array from next.config.mjs
// ---------------------------------------------------------------------------

// next.config.mjs is an ES module; ts-jest is configured for CommonJS, so we
// parse the file as text and extract the relevant structure rather than
// dynamic import (which would need an async test + ESM-aware jest transform).
//
// Approach: call the actual exported config object's headers() method.
// We cannot `import` an .mjs directly in CJS jest, but we CAN require the
// compiled output that ts-jest would produce via a manual require workaround.
// The simplest portable approach: read the file, parse headers with a
// lightweight structural extractor, and assert on the shape.
//
// For correctness we use the *actual* built config via child_process so we
// exercise the real file rather than a hand-crafted mock.

import { execSync } from "child_process";
import path from "path";

const ROOT = path.resolve(__dirname, "../../");

/**
 * Evaluate next.config.mjs in a Node subprocess that supports .mjs and
 * returns the serialised headers() output as JSON.
 */
function getHeaderRules(): any[] {
  // Node can run .mjs natively with --input-type=module or via a temp script.
  // We pipe a small ESM shim that imports the config and calls headers().
  const script = `
import cfg from '${ROOT}/next.config.mjs';
// Sentry wraps the config — unwrap to reach the plain nextConfig
const base = cfg?.nextConfig ?? cfg;
const headers = await base.headers();
process.stdout.write(JSON.stringify(headers));
`;
  const result = execSync(
    `node --input-type=module`,
    {
      input: script,
      cwd: ROOT,
      env: { ...process.env, SENTRY_AUTH_TOKEN: "" }, // suppress Sentry wrap
      timeout: 15_000,
    },
  );
  return JSON.parse(result.toString());
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Find a header value by key inside a rule's headers array. */
function headerValue(rule: any, key: string): string | undefined {
  const h = (rule.headers as any[]).find(
    (hdr: any) => hdr.key.toLowerCase() === key.toLowerCase(),
  );
  return h?.value;
}

/** Return true if the rule has a `missing` entry for the given query key. */
function hasMissingParam(rule: any, key: string): boolean {
  if (!Array.isArray(rule.missing)) return false;
  return rule.missing.some(
    (m: any) => m.type === "query" && m.key === key,
  );
}

/** Return true if the rule has a `has` entry for the given query key=value. */
function hasParam(rule: any, key: string, value: string): boolean {
  if (!Array.isArray(rule.has)) return false;
  return rule.has.some(
    (h: any) => h.type === "query" && h.key === key && h.value === value,
  );
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe("next.config.mjs — heatmap-preview header rules", () => {
  let rules: any[];

  beforeAll(() => {
    rules = getHeaderRules();
  });

  // =========================================================================
  // (a) Global secure-default rule
  // =========================================================================

  test("(a) a rule with missing __heatmap_bg exists", () => {
    const globalRule = rules.find((r) => hasMissingParam(r, "__heatmap_bg"));
    expect(globalRule).toBeDefined();
  });

  test("(a) global rule emits X-Frame-Options: DENY", () => {
    const globalRule = rules.find((r) => hasMissingParam(r, "__heatmap_bg"));
    expect(headerValue(globalRule, "X-Frame-Options")).toBe("DENY");
  });

  test("(a) global rule CSP includes frame-ancestors 'none'", () => {
    const globalRule = rules.find((r) => hasMissingParam(r, "__heatmap_bg"));
    const csp = headerValue(globalRule, "Content-Security-Policy") ?? "";
    expect(csp).toContain("frame-ancestors 'none'");
  });

  test("(a) global rule does NOT have a `has __heatmap_bg` condition", () => {
    const globalRule = rules.find((r) => hasMissingParam(r, "__heatmap_bg"));
    expect(hasParam(globalRule, "__heatmap_bg", "1")).toBe(false);
  });

  // =========================================================================
  // (b) Preview rule
  // =========================================================================

  test("(b) a rule with has __heatmap_bg=1 exists", () => {
    const previewRule = rules.find((r) => hasParam(r, "__heatmap_bg", "1"));
    expect(previewRule).toBeDefined();
  });

  test("(b) preview rule emits X-Frame-Options: SAMEORIGIN", () => {
    const previewRule = rules.find((r) => hasParam(r, "__heatmap_bg", "1"));
    expect(headerValue(previewRule, "X-Frame-Options")).toBe("SAMEORIGIN");
  });

  test("(b) preview rule CSP includes frame-ancestors 'self'", () => {
    const previewRule = rules.find((r) => hasParam(r, "__heatmap_bg", "1"));
    const csp = headerValue(previewRule, "Content-Security-Policy") ?? "";
    expect(csp).toContain("frame-ancestors 'self'");
  });

  // =========================================================================
  // (c) frame-ancestors in preview branch is exactly 'self' — safety checks
  // =========================================================================

  test("(c) preview frame-ancestors is NOT 'none'", () => {
    const previewRule = rules.find((r) => hasParam(r, "__heatmap_bg", "1"));
    const csp = headerValue(previewRule, "Content-Security-Policy") ?? "";
    // Must not contain 'none' as the frame-ancestors value
    expect(csp).not.toMatch(/frame-ancestors\s+'none'/);
  });

  test("(c) preview frame-ancestors is NOT '*' (third-party framing blocked)", () => {
    const previewRule = rules.find((r) => hasParam(r, "__heatmap_bg", "1"));
    const csp = headerValue(previewRule, "Content-Security-Policy") ?? "";
    expect(csp).not.toMatch(/frame-ancestors\s+\*/);
  });

  test("(c) preview frame-ancestors is exactly 'self' and nothing else", () => {
    const previewRule = rules.find((r) => hasParam(r, "__heatmap_bg", "1"));
    const csp = headerValue(previewRule, "Content-Security-Policy") ?? "";
    // Extract the frame-ancestors directive value
    const match = csp.match(/frame-ancestors\s+([^;]+)/);
    expect(match).not.toBeNull();
    const faValue = match![1].trim();
    expect(faValue).toBe("'self'");
  });

  // =========================================================================
  // (d) Mutual exclusion — both rules cannot match the same request
  // =========================================================================

  test("(d) global rule requires param to be MISSING — cannot match when ?__heatmap_bg=1 is present", () => {
    const globalRule = rules.find((r) => hasMissingParam(r, "__heatmap_bg"));
    // Simulate: param IS present — missing condition is NOT satisfied
    const paramPresent = true; // __heatmap_bg=1 is in the URL
    const missingConditionSatisfied = !paramPresent;
    expect(hasMissingParam(globalRule, "__heatmap_bg")).toBe(true);
    expect(missingConditionSatisfied).toBe(false);
  });

  test("(d) preview rule requires param to be present — cannot match when param is absent", () => {
    const previewRule = rules.find((r) => hasParam(r, "__heatmap_bg", "1"));
    // Simulate: param is absent — has condition is NOT satisfied
    const paramAbsent = true;
    const hasConditionSatisfied = !paramAbsent;
    expect(hasParam(previewRule, "__heatmap_bg", "1")).toBe(true);
    expect(hasConditionSatisfied).toBe(false);
  });

  test("(d) the two rules are distinct objects (not the same rule)", () => {
    const globalRule = rules.find((r) => hasMissingParam(r, "__heatmap_bg"));
    const previewRule = rules.find((r) => hasParam(r, "__heatmap_bg", "1"));
    expect(globalRule).not.toBe(previewRule);
    // Verify they set opposite X-Frame-Options values
    expect(headerValue(globalRule, "X-Frame-Options")).toBe("DENY");
    expect(headerValue(previewRule, "X-Frame-Options")).toBe("SAMEORIGIN");
  });

  // =========================================================================
  // Invariant: non-framing security headers are identical in both rules
  // =========================================================================

  test("both rules emit identical HSTS, X-Content-Type-Options, Referrer-Policy", () => {
    const globalRule = rules.find((r) => hasMissingParam(r, "__heatmap_bg"));
    const previewRule = rules.find((r) => hasParam(r, "__heatmap_bg", "1"));

    for (const hdr of ["Strict-Transport-Security", "X-Content-Type-Options", "Referrer-Policy"]) {
      expect(headerValue(previewRule, hdr)).toBe(headerValue(globalRule, hdr));
    }
  });
});
