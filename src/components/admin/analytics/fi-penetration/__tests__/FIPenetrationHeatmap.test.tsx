/**
 * @jest-environment jsdom
 *
 * FIPenetrationHeatmap UI: loading -> empty -> populated render paths.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import FIPenetrationHeatmap from "@/components/admin/analytics/fi-penetration/FIPenetrationHeatmap";

declare const global: any;

function mount(container: HTMLElement): Root {
  let root!: Root;
  act(() => {
    root = createRoot(container);
    root.render(<FIPenetrationHeatmap />);
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

describe("FIPenetrationHeatmap", () => {
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

  test("renders the loading placeholder before the fetch resolves", async () => {
    global.fetch = jest.fn(() => new Promise(() => { /* never resolves */ }));
    mount(container);
    expect(container.querySelector('[data-testid="fi-pen-loading"]')).not.toBeNull();
  });

  test("renders the honest empty state when zero cells", async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            cells: [],
            headline: "No F&I activity in the selected window yet.",
            managers: [],
            products: [],
            months: [],
            generatedAt: new Date().toISOString(),
          }),
      }),
    );
    mount(container);
    await settle();
    expect(container.querySelector('[data-testid="fi-pen-empty"]')).not.toBeNull();
  });

  test("renders the populated grid + headline + month select", async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            cells: [
              {
                fi_manager_id: "m1",
                fi_manager_name: "Maria",
                product_type: "gap",
                month: "2026-03-01",
                attach_rate: 0.78,
                gross_total: 4200,
                deals_count: 20,
              },
              {
                fi_manager_id: "m1",
                fi_manager_name: "Maria",
                product_type: "warranty",
                month: "2026-03-01",
                attach_rate: 0.55,
                gross_total: 3100,
                deals_count: 20,
              },
            ],
            headline: "Maria hit 78% attach rate on GAP in March 2026.",
            managers: [{ id: "m1", name: "Maria" }],
            products: ["gap", "warranty"],
            months: ["2026-03-01"],
            generatedAt: new Date().toISOString(),
          }),
      }),
    );
    mount(container);
    await settle();
    const root = container.querySelector('[data-testid="fi-pen-root"]');
    expect(root).not.toBeNull();
    const headline = container.querySelector('[data-testid="fi-pen-headline"]');
    expect(headline?.textContent).toContain("Maria");
    expect(headline?.textContent).toContain("78%");
    const grid = container.querySelector('[data-testid="fi-pen-grid"]');
    expect(grid).not.toBeNull();
    // Plain-English labels in the table head, never raw enums.
    expect(container.innerHTML).toContain("GAP");
    expect(container.innerHTML).toContain("Extended Warranty");
    expect(container.innerHTML).not.toContain("attach_rate");
  });

  test("renders a `demo data` chip when the shadow flag is set", async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            cells: [
              {
                fi_manager_id: "m1",
                fi_manager_name: "Maria",
                product_type: "gap",
                month: "2026-03-01",
                attach_rate: 0.5,
                gross_total: 1000,
                deals_count: 10,
              },
            ],
            headline: "Maria hit 50% attach rate on GAP in March 2026.",
            managers: [{ id: "m1", name: "Maria" }],
            products: ["gap"],
            months: ["2026-03-01"],
            generatedAt: new Date().toISOString(),
            shadow: true,
          }),
      }),
    );
    mount(container);
    await settle();
    expect(container.querySelector('[data-testid="fi-pen-shadow"]')).not.toBeNull();
  });
});
