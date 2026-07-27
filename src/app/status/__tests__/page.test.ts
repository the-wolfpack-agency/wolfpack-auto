/**
 * Structural tests for /status — public uptime page.
 *
 * Uses the source-string pattern (matches src/app/admin/auction/__tests__).
 * This page renders dynamically + has a client poller; behavioral E2E
 * lives in tests/e2e (to be added when /status is included in the public
 * E2E sweep).
 *
 * Contract:
 *   - Page is a server component, no "use client" directive.
 *   - It server-fetches /api/status for first paint.
 *   - It mounts the StatusBoard client component which renders the overall
 *     banner, components grid, and incidents empty state.
 *   - Footer links to mailto:status@thewolfpack.agency.
 *   - No em dashes in user-facing copy (per project convention).
 */

import * as fs from "fs";
import * as path from "path";

const PAGE_PATH = path.join(__dirname, "..", "page.tsx");
const BOARD_PATH = path.join(__dirname, "..", "status-board.tsx");

let pageSrc: string;
let boardSrc: string;

beforeAll(() => {
  pageSrc = fs.readFileSync(PAGE_PATH, "utf-8");
  boardSrc = fs.readFileSync(BOARD_PATH, "utf-8");
});

describe("/status page", () => {
  it("is a server component (no 'use client')", () => {
    // The page itself does the initial fetch on the server; the board
    // is the client component.
    expect(pageSrc.trim().startsWith('"use client"')).toBe(false);
  });

  it("server-fetches /api/status for the initial payload", () => {
    expect(pageSrc).toContain("/api/status");
  });

  it("mounts StatusBoard with the initial server payload", () => {
    expect(pageSrc).toContain("StatusBoard");
    expect(pageSrc).toMatch(/initial=\{initial\}/);
  });

  it("links the subscribe affordance to status@thewolfpack.agency", () => {
    expect(pageSrc).toContain("mailto:status@thewolfpack.agency");
  });

  it("uses brand colors in copy/style (#0070c7 / #0a406f)", () => {
    expect(pageSrc).toContain("#0070c7");
  });

  it("has no em dashes in the visible copy (project convention)", () => {
    // Em dash is U+2014. Search the whole source.
    expect(pageSrc.includes("—")).toBe(false);
    expect(boardSrc.includes("—")).toBe(false);
  });
});

describe("/status StatusBoard (client)", () => {
  it("is a client component", () => {
    expect(boardSrc.trim().startsWith('"use client"')).toBe(true);
  });

  it("polls /api/status on an interval", () => {
    // Uses the visibility-aware poller so a backgrounded tab stops hitting
    // the DB (Neon egress). Do not revert to a raw setInterval.
    expect(boardSrc).toContain("pollWhileVisible");
    expect(boardSrc).toContain("/api/status");
    // 2 min poll cadence. Originally 30s, deliberately stretched to 120_000
    // in the 2026-05-19 Neon data-transfer quota fix (commit c72c37d), which
    // also introduced /api/cron/prune-analytics. Reverting to 30s would
    // reintroduce the read-polling burn that fix resolved.
    expect(boardSrc).toMatch(/POLL_INTERVAL_MS\s*=\s*120_000/);
  });

  it("renders the overall banner with data-overall attribute for E2E", () => {
    expect(boardSrc).toContain('data-testid="overall-banner"');
    expect(boardSrc).toContain("data-overall=");
  });

  it("renders the components grid", () => {
    expect(boardSrc).toContain('data-testid="components-grid"');
  });

  it("renders the no-incidents empty state with the required copy", () => {
    expect(boardSrc).toContain('data-testid="incidents-empty"');
    expect(boardSrc).toContain("No incidents in the last 30 days.");
  });

  it("includes a 90-day sparkline grid", () => {
    expect(boardSrc).toContain("buildSparkline");
    expect(boardSrc).toMatch(/grid-cols-\[repeat\(90,/);
  });

  it("maps each ComponentStatus to a status dot color (operational/degraded/major_outage/maintenance)", () => {
    expect(boardSrc).toContain("operational");
    expect(boardSrc).toContain("degraded");
    expect(boardSrc).toContain("major_outage");
    expect(boardSrc).toContain("maintenance");
    // Tailwind color tokens for each.
    expect(boardSrc).toContain("emerald-500");
    expect(boardSrc).toContain("amber-500");
    expect(boardSrc).toContain("rose-500");
    expect(boardSrc).toContain("sky-500");
  });

  it("never lets the page render blank — falls back to a default payload", () => {
    // The board uses a `payload ?? { overall: 'operational', ... }` fallback.
    expect(boardSrc).toMatch(/payload\s*\?\?\s*\{/);
  });
});
