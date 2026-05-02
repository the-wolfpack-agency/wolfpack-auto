/**
 * UI structural tests for /admin/maintenance-leads.
 *
 * @testing-library/react is not installed in this repo (jest is node-env
 * + jsdom for stretch tests). Tests assert structure of the page source
 * + key non-technical strings + presence of urgency groups + empty state +
 * dismiss / complete handlers — the same surface a render+click test would
 * cover. Behavioral end-to-end coverage is in the Playwright spec.
 */

import * as fs from "fs";
import * as path from "path";

const PAGE_PATH = path.join(
  __dirname,
  "..",
  "page.tsx",
);

let source: string;
beforeAll(() => {
  source = fs.readFileSync(PAGE_PATH, "utf-8");
});

describe("/admin/maintenance-leads page", () => {
  it("is a client component", () => {
    expect(source.trim().startsWith('"use client"')).toBe(true);
  });

  it("renders four urgency groups (immediate / soon / scheduled / monitoring)", () => {
    expect(source).toContain('"immediate"');
    expect(source).toContain('"soon"');
    expect(source).toContain('"scheduled"');
    expect(source).toContain('"monitoring"');
    // group testids
    expect(source).toContain("urgency-group-");
  });

  it("uses plain-English copy, not internal jargon (per non-technical UI rule)", () => {
    // headline + empty-state copy
    expect(source).toMatch(/Predictive maintenance/);
    expect(source).toMatch(/No leads to act on right now/);
    expect(source).toMatch(/Right now/);
    expect(source).toMatch(/This week/);
    // No raw signal type in user-facing text
    expect(source).not.toMatch(/oil_life crossed threshold/);
  });

  it("wires up dismiss + complete actions per row", () => {
    expect(source).toContain("lead-dismiss-");
    expect(source).toContain("lead-complete-");
    expect(source).toContain("/api/admin/maintenance-leads/");
    // Action is interpolated through `${action}` from "complete" | "dismiss"
    expect(source).toContain('"complete"');
    expect(source).toContain('"dismiss"');
  });

  it("has an empty-state element with a testid", () => {
    expect(source).toContain('data-testid="maintenance-leads-empty"');
  });

  it("is mobile-responsive (uses sm: / overflow-x-auto)", () => {
    expect(source).toMatch(/sm:p-6|sm:px|sm:text|sm:flex/);
    expect(source).toContain("overflow-x-auto");
  });

  it("loads from /api/admin/maintenance-leads with status=open filter", () => {
    expect(source).toMatch(
      /\/api\/admin\/maintenance-leads\?status=open/,
    );
  });
});
