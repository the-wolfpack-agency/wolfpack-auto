/**
 * Structural tests for the RecallsPanel component.
 *
 * Asserts surface contract (testids + class hooks + endpoint URLs + plain-
 * English copy) without booting a full React render — matches the existing
 * `/admin/maintenance-leads` test pattern. Live render+click coverage lives
 * in the Playwright E2E spec.
 */

import * as fs from "fs";
import * as path from "path";

const PANEL_PATH = path.join(__dirname, "..", "RecallsPanel.tsx");

let source: string;
beforeAll(() => {
  source = fs.readFileSync(PANEL_PATH, "utf-8");
});

describe("RecallsPanel component", () => {
  it("is a client component", () => {
    expect(source).toMatch(/^\s*\/\*\*[\s\S]*?\*\/\s*\n+"use client";/);
  });

  it("exposes the expected testids for E2E hooks", () => {
    expect(source).toContain('data-testid="recalls-panel"');
    expect(source).toContain('data-testid="recalls-panel-empty"');
    expect(source).toContain('data-testid="recalls-panel-loading"');
    expect(source).toContain('data-testid="recalls-panel-error"');
    expect(source).toContain("recalls-list");
    expect(source).toContain("tsbs-list");
    expect(source).toContain("recall-resolve-");
    expect(source).toContain("recall-dismiss-");
  });

  it("renders critical recalls in red, moderate/minor in yellow, TSBs in blue", () => {
    // critical
    expect(source).toMatch(/critical[\s\S]*?bg-red-50[\s\S]*?border-red-300/);
    // moderate
    expect(source).toMatch(/moderate[\s\S]*?bg-yellow-50[\s\S]*?border-yellow-300/);
    // TSB blue banner — the panel uses Tailwind's blue-50 + blue-200 pair,
    // but order on the className string can vary, so check both classes
    // appear together in the source (broader match).
    expect(source).toContain("bg-blue-50");
    expect(source).toContain("border-blue-200");
  });

  it("hits the canonical recalls endpoint URLs", () => {
    expect(source).toMatch(/\/api\/admin\/vehicles\/\$\{encodeURIComponent\(vehicleId\)\}\/recalls/);
    expect(source).toMatch(
      /\/api\/admin\/vehicles\/\$\{encodeURIComponent\(vehicleId\)\}\/recalls\/\$\{encodeURIComponent\(recallId\)\}/,
    );
  });

  it("uses plain-English copy for dealer users (non-technical UI rule)", () => {
    expect(source).toContain("Critical safety recall");
    expect(source).toContain("Open recall");
    expect(source).toContain("Service bulletin");
    expect(source).toContain("Mark resolved");
    expect(source).toContain("Customer declined");
    // No raw event names or jargon
    expect(source).not.toMatch(/service\.recall_flagged/);
  });

  it("shows an empty state when no recalls or TSBs apply", () => {
    expect(source).toContain("No open recalls or applicable service bulletins");
  });

  it("labels mock TSBs explicitly so dealer staff never confuse them for OEM data", () => {
    expect(source).toContain("Synthetic example — not from manufacturer");
  });

  it("is mobile-responsive (uses sm: breakpoints and flex column→row)", () => {
    expect(source).toMatch(/sm:p-6/);
    expect(source).toMatch(/sm:flex-row/);
  });

  it("posts the PATCH with the correct status payload shape", () => {
    expect(source).toContain('"resolved"');
    expect(source).toContain('"dismissed_by_owner"');
    expect(source).toContain('method: "PATCH"');
  });
});

describe("service write-up integration", () => {
  it("repair-orders page mounts the panel when a VIN is entered", () => {
    const roPagePath = path.join(
      __dirname,
      "../../../app/admin/service/repair-orders/page.tsx",
    );
    const ro = fs.readFileSync(roPagePath, "utf-8");
    expect(ro).toContain(
      'import RecallsPanel from "@/components/service/RecallsPanel"',
    );
    expect(ro).toContain('data-testid="repair-order-recalls-panel"');
    expect(ro).toContain("<RecallsPanel vehicleId={form.vin}");
  });

  it("vehicle edit page mounts the panel as a sub-section", () => {
    const editPath = path.join(
      __dirname,
      "../../../app/admin/vehicles/[vin]/edit/page.tsx",
    );
    const edit = fs.readFileSync(editPath, "utf-8");
    expect(edit).toContain(
      'import RecallsPanel from "@/components/service/RecallsPanel"',
    );
    expect(edit).toContain("<RecallsPanel vehicleId={vin}");
  });
});
