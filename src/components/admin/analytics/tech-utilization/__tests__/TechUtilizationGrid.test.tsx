/**
 * @jest-environment jsdom
 *
 * TechUtilizationGrid UI: empty + populated + shadow chip.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import TechUtilizationGrid from "@/components/admin/analytics/tech-utilization/TechUtilizationGrid";

declare const global: any;

function mount(container: HTMLElement): Root {
  let root!: Root;
  act(() => {
    root = createRoot(container);
    root.render(<TechUtilizationGrid />);
  });
  return root;
}

async function settle() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("TechUtilizationGrid", () => {
  let container: HTMLDivElement;
  let originalFetch: typeof fetch;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    originalFetch = global.fetch;
  });
  afterEach(() => {
    document.body.removeChild(container);
    global.fetch = originalFetch;
  });

  test("renders empty state when cells is empty", async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            cells: [],
            headline: "No repair orders billed in the selected window.",
            techs: [],
            bays: [],
            weeks: [],
            generatedAt: new Date().toISOString(),
            hoursAvailableFromConstant: true,
          }),
      }),
    );
    mount(container);
    await settle();
    expect(container.querySelector('[data-testid="tu-empty"]')).not.toBeNull();
  });

  test("renders headline + grid with bay columns + plain English", async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            cells: [
              {
                tech_id: "t1",
                tech_name: "Sam",
                bay_id: "A1",
                week_start: "2026-05-04",
                hours_billed: 36,
                hours_available: 40,
                utilization: 0.9,
                ro_count: 12,
                labor_revenue: 5200,
              },
              {
                tech_id: "t2",
                tech_name: "Devon",
                bay_id: "B1",
                week_start: "2026-05-04",
                hours_billed: 28,
                hours_available: 40,
                utilization: 0.7,
                ro_count: 9,
                labor_revenue: 4060,
              },
            ],
            headline:
              "Sam billed 36.0h (90%) week of May 4 in bay A1.",
            techs: [
              { id: "t1", name: "Sam" },
              { id: "t2", name: "Devon" },
            ],
            bays: ["A1", "B1"],
            weeks: ["2026-05-04"],
            generatedAt: new Date().toISOString(),
            hoursAvailableFromConstant: true,
          }),
      }),
    );
    mount(container);
    await settle();
    const headline = container.querySelector('[data-testid="tu-headline"]');
    expect(headline?.textContent).toContain("Sam");
    expect(headline?.textContent).toContain("36.0h");
    expect(headline?.textContent).toContain("90%");
    const grid = container.querySelector('[data-testid="tu-grid"]');
    expect(grid).not.toBeNull();
    expect(container.innerHTML).toContain("Bay A1");
    expect(container.innerHTML).toContain("Bay B1");
    // No raw enum / db column names leaking through.
    expect(container.innerHTML).not.toContain("hours_billed");
  });

  test("shadow chip renders when shadow=true", async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            cells: [
              {
                tech_id: "t1",
                tech_name: "Sam",
                bay_id: "A1",
                week_start: "2026-05-04",
                hours_billed: 10,
                hours_available: 40,
                utilization: 0.25,
                ro_count: 3,
                labor_revenue: 1450,
              },
            ],
            headline: "Sam billed 10.0h (25%) week of May 4 in bay A1.",
            techs: [{ id: "t1", name: "Sam" }],
            bays: ["A1"],
            weeks: ["2026-05-04"],
            generatedAt: new Date().toISOString(),
            hoursAvailableFromConstant: true,
            shadow: true,
          }),
      }),
    );
    mount(container);
    await settle();
    expect(container.querySelector('[data-testid="tu-shadow"]')).not.toBeNull();
  });
});
