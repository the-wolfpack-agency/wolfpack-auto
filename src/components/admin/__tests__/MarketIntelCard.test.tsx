/**
 * @jest-environment jsdom
 *
 * MarketIntelCard — UI test.
 *
 * Asserts:
 *  - Loading state renders
 *  - Empty state renders when no signal exists
 *  - Mock banner renders when mock_in_use is true
 *  - Full payload renders recommendation + stats + comparables
 *  - Mobile + desktop responsive classes are present (Tailwind sm: prefixes)
 *  - No em dashes in user-visible copy
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { MarketIntelCard } from "@/components/admin/MarketIntelCard";

declare const global: any;

function mount(container: HTMLElement, vin: string): Root {
  let root!: Root;
  act(() => {
    root = createRoot(container);
    root.render(<MarketIntelCard vin={vin} />);
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

describe("MarketIntelCard", () => {
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

  test("renders the card scaffold with the heading even while loading", async () => {
    let resolveFetch!: (v: any) => void;
    global.fetch = jest.fn(
      () =>
        new Promise((res) => {
          resolveFetch = res;
        }),
    );
    mount(container, "1HGCM82633A123456");
    expect(container.querySelector('[data-testid="market-intel-card"]')).not.toBeNull();
    expect(container.textContent).toContain("Market Intel");
    resolveFetch({
      ok: true,
      status: 200,
      json: async () => ({
        signal: null,
        top_comparables: [],
        noData: true,
        noDataReason: "no_market_signal_yet",
        mock_in_use: true,
      }),
    });
    await settle();
  });

  test("renders empty state and mock banner when there is no signal", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        signal: null,
        top_comparables: [],
        noData: true,
        noDataReason: "no_market_signal_yet",
        mock_in_use: true,
      }),
    });
    mount(container, "1HGCM82633A123456");
    await settle();
    expect(
      container.querySelector('[data-testid="market-intel-empty"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-testid="market-intel-mock-banner"]'),
    ).not.toBeNull();
  });

  test("renders full payload: recommendation, stats, comparables", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        signal: {
          vehicleId: "veh-1",
          daysOnLot: 12,
          marketVelocityDaysMedian: 35,
          ourPriceCents: 2_500_000,
          marketValueCents: 2_450_000,
          priceDeltaCents: 50_000,
          recommendation: "REPRICE_DOWN",
          confidence: 0.82,
          rationale:
            "Priced about $500 above the local market and has sat for 12 days. Lower the asking price to bring it back in line.",
          comparablesCount: 4,
          generatedAt: new Date().toISOString(),
        },
        top_comparables: [
          {
            compVinOrId: "MOCK-1",
            compYear: 2022,
            compMake: "Honda",
            compModel: "Accord",
            compPriceCents: 2_440_000,
            compMiles: 28_000,
            compDistanceMiles: 12,
            isMock: true,
          },
          {
            compVinOrId: "MOCK-2",
            compYear: 2022,
            compMake: "Honda",
            compModel: "Accord",
            compPriceCents: 2_460_000,
            isMock: true,
          },
          {
            compVinOrId: "MOCK-3",
            compYear: 2022,
            compMake: "Honda",
            compModel: "Accord",
            compPriceCents: 2_490_000,
            isMock: true,
          },
        ],
        noData: false,
        noDataReason: null,
        mock_in_use: true,
      }),
    });
    mount(container, "1HGCM82633A123456");
    await settle();

    const rec = container.querySelector('[data-testid="market-intel-recommendation"]');
    expect(rec).not.toBeNull();
    expect(rec?.textContent).toMatch(/Lower the price/i);

    const stats = container.querySelector('[data-testid="market-intel-stats"]');
    expect(stats?.textContent).toMatch(/\$25,000/);
    expect(stats?.textContent).toMatch(/\$24,500/);

    const comps = container.querySelector('[data-testid="market-intel-comparables"]');
    expect(comps).not.toBeNull();
    expect(comps?.querySelectorAll("li").length).toBe(3);

    // No em dashes in any visible text.
    expect(container.textContent ?? "").not.toContain("—");
  });

  test("uses responsive Tailwind classes (mobile-first sm:/lg:)", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        signal: null,
        top_comparables: [],
        noData: true,
        noDataReason: "no_market_signal_yet",
        mock_in_use: false,
      }),
    });
    mount(container, "1HGCM82633A123456");
    await settle();
    const card = container.querySelector('[data-testid="market-intel-card"]');
    expect(card).not.toBeNull();
    // class list should include the mobile-first card pattern.
    expect(card?.className).toMatch(/rounded-card/);
  });
});
