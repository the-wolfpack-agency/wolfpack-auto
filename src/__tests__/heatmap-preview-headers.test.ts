/**
 * @jest-environment node
 *
 * Frame-protection headers are owned by middleware (NOT next.config), because
 * Next.js `headers()` query-condition rules are ignored at Vercel's edge. This
 * suite drives the ACTUAL middleware to assert RUNTIME behavior — the kind of
 * test that would have caught the edge-config gap:
 *
 *  (a) A normal request -> X-Frame-Options: DENY + frame-ancestors 'none'.
 *  (b) A ?__heatmap_bg=1 request -> X-Frame-Options: SAMEORIGIN +
 *      frame-ancestors 'self' (same-origin framing ONLY — third-party
 *      clickjacking still blocked).
 *  (c) frame-ancestors in preview is exactly 'self' — never 'none', never '*'.
 *  (d) next.config.mjs no longer sets X-Frame-Options / frame-ancestors, so
 *      there is no header conflict for middleware to lose to.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import { NextRequest } from "next/server";
import { execSync } from "child_process";
import path from "path";
import { middleware } from "../middleware";

const ROOT = path.resolve(__dirname, "../../");

function reqFor(url: string): NextRequest {
  return new NextRequest(new URL(url));
}

/** Collect all values of a (possibly repeated) response header. */
function allHeaderValues(res: Response, key: string): string {
  // Headers.get() comma-joins repeated values — sufficient for our assertions.
  return res.headers.get(key) ?? "";
}

describe("middleware frame protection (runtime)", () => {
  // (a) ---------------------------------------------------------------------
  test("(a) normal public request -> X-Frame-Options DENY", async () => {
    const res = await middleware(reqFor("https://wolfpack-auto.vercel.app/"));
    expect(res.headers.get("X-Frame-Options")).toBe("DENY");
  });

  test("(a) normal public request -> CSP frame-ancestors 'none'", async () => {
    const res = await middleware(reqFor("https://wolfpack-auto.vercel.app/"));
    expect(allHeaderValues(res, "Content-Security-Policy")).toContain(
      "frame-ancestors 'none'",
    );
  });

  // (b) ---------------------------------------------------------------------
  test("(b) ?__heatmap_bg=1 -> X-Frame-Options SAMEORIGIN", async () => {
    const res = await middleware(
      reqFor("https://wolfpack-auto.vercel.app/?__heatmap_bg=1"),
    );
    expect(res.headers.get("X-Frame-Options")).toBe("SAMEORIGIN");
  });

  test("(b) ?__heatmap_bg=1 -> CSP frame-ancestors 'self'", async () => {
    const res = await middleware(
      reqFor("https://wolfpack-auto.vercel.app/?__heatmap_bg=1"),
    );
    expect(allHeaderValues(res, "Content-Security-Policy")).toContain(
      "frame-ancestors 'self'",
    );
  });

  test("(b) preview works on a deep public path too (e.g. /inventory)", async () => {
    const res = await middleware(
      reqFor("https://wolfpack-auto.vercel.app/inventory?__heatmap_bg=1"),
    );
    expect(res.headers.get("X-Frame-Options")).toBe("SAMEORIGIN");
  });

  // (c) safety --------------------------------------------------------------
  test("(c) preview frame-ancestors is exactly 'self' (not none, not *)", async () => {
    const res = await middleware(
      reqFor("https://wolfpack-auto.vercel.app/?__heatmap_bg=1"),
    );
    const csp = allHeaderValues(res, "Content-Security-Policy");
    const match = csp.match(/frame-ancestors\s+([^;,]+)/);
    expect(match).not.toBeNull();
    expect(match![1].trim()).toBe("'self'");
    expect(csp).not.toMatch(/frame-ancestors\s+\*/);
  });

  test("(c) a wrong param value does NOT enable framing", async () => {
    const res = await middleware(
      reqFor("https://wolfpack-auto.vercel.app/?__heatmap_bg=0"),
    );
    expect(res.headers.get("X-Frame-Options")).toBe("DENY");
  });

  // (d) no conflicting config ----------------------------------------------
  test("(d) next.config.mjs no longer sets X-Frame-Options or frame-ancestors", () => {
    const script = `
import cfg from '${ROOT}/next.config.mjs';
const base = cfg?.nextConfig ?? cfg;
const headers = await base.headers();
process.stdout.write(JSON.stringify(headers));
`;
    const out = execSync(`node --input-type=module`, {
      input: script,
      cwd: ROOT,
      env: { ...process.env, SENTRY_AUTH_TOKEN: "" },
      timeout: 15_000,
    }).toString();
    const rules = JSON.parse(out) as any[];
    for (const rule of rules) {
      for (const h of rule.headers as any[]) {
        expect(h.key.toLowerCase()).not.toBe("x-frame-options");
        if (h.key.toLowerCase() === "content-security-policy") {
          expect(h.value).not.toContain("frame-ancestors");
        }
      }
    }
  });
});
