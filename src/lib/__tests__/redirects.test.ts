/**
 * Contract test for next.config.mjs redirects (Fix 3).
 *
 * Three intuitive URLs previously 404'd:
 *   - /admin/dashboard      (older nav holdover; real home is /admin)
 *   - /dealers              (no index page; sub-paths exist as /dealers/[slug])
 *   - /audits               (no index page; sub-paths are /audits/fi-penetration etc.)
 *
 * `next.config.mjs` is an ESM file that imports Sentry — Jest can't load it
 * directly, so this test parses the file as text and asserts each redirect
 * entry is present. That's enough to lock the contract.
 */

import * as fs from "fs";
import * as path from "path";

const CONFIG_PATH = path.resolve(__dirname, "../../../next.config.mjs");

let config = "";

beforeAll(() => {
  config = fs.readFileSync(CONFIG_PATH, "utf-8");
});

describe("next.config.mjs — redirects()", () => {
  test("file exists and exposes a redirects() block", () => {
    expect(config.length).toBeGreaterThan(0);
    expect(config).toMatch(/async\s+redirects\s*\(\s*\)/);
  });

  test("preserves the prior /login and /signin redirects", () => {
    expect(config).toMatch(
      /source:\s*["']\/login["'][^}]*destination:\s*["']\/admin\/login["']/,
    );
    expect(config).toMatch(
      /source:\s*["']\/signin["'][^}]*destination:\s*["']\/admin\/login["']/,
    );
  });

  test("/admin/dashboard -> /admin", () => {
    expect(config).toMatch(
      /source:\s*["']\/admin\/dashboard["'][^}]*destination:\s*["']\/admin["']/,
    );
  });

  test("/dealers -> /pricing", () => {
    expect(config).toMatch(
      /source:\s*["']\/dealers["'][^}]*destination:\s*["']\/pricing["']/,
    );
  });

  test("/audits -> /audits/fi-penetration", () => {
    expect(config).toMatch(
      /source:\s*["']\/audits["'][^}]*destination:\s*["']\/audits\/fi-penetration["']/,
    );
  });
});
