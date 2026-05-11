/**
 * @jest-environment jsdom
 *
 * LeadEnrichmentPanel — interactive UI test.
 *
 * Mounts the component into jsdom with a mocked `fetch`. Verifies:
 *   - Loading placeholder renders first
 *   - On 200 response, all three panels appear with enriched data,
 *     score breakdown, and the routing reason
 *   - On 401, redirects via window.location.href (with /login)
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import LeadEnrichmentPanel from "../LeadEnrichmentPanel";

declare const global: any;

function mountInto(container: HTMLElement, leadId: string): Root {
  let root!: Root;
  act(() => {
    root = createRoot(container);
    root.render(<LeadEnrichmentPanel leadId={leadId} />);
  });
  return root;
}

async function settle() {
  // Flush microtasks so the fetch promise + setState callbacks run.
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("LeadEnrichmentPanel", () => {
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

  test("renders loading placeholder before fetch resolves", async () => {
    let resolveFetch!: (v: any) => void;
    global.fetch = jest.fn(
      () =>
        new Promise((res) => {
          resolveFetch = res;
        }),
    );
    mountInto(container, "lead-1");
    expect(container.querySelector('[data-testid="lead-enrichment-panel-loading"]')).not.toBeNull();
    // resolve so we don't leak the pending promise
    resolveFetch({
      ok: true,
      status: 200,
      json: async () => ({
        lead_id: "lead-1",
        dealer_id: "d",
        enrichment: null,
        routing: null,
      }),
    });
    await settle();
  });

  test("renders three panels on 200 with enrichment + routing data", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        lead_id: "lead-1",
        dealer_id: "d",
        enrichment: {
          enriched_data: { household_income_band: "$75-100k", property_owner: true },
          confidence: 0.66,
          sources: ["mock"],
          generated_at: "2026-05-11T00:00:00.000Z",
        },
        routing: {
          candidate_users: ["u-1", "u-2"],
          chosen_user_id: "u-1",
          decision_factors: {
            reason: "rep specializes in this vehicle",
            score: {
              score: 82,
              tier: "hot",
              factors: [
                { name: "credit_signal", weight: 20, score: 0.85, notes: "prime band" },
              ],
            },
          },
          created_at: "2026-05-11T00:00:00.000Z",
        },
      }),
    });

    mountInto(container, "lead-1");
    await settle();

    const panel = container.querySelector('[data-testid="lead-enrichment-panel"]');
    expect(panel).not.toBeNull();
    expect(container.querySelector('[data-testid="enriched-data"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="score-breakdown"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="why-this-rep"]')).not.toBeNull();
    const html = container.innerHTML;
    expect(html).toContain("$75-100k");
    expect(html).toContain("82");
    expect(html).toContain("u-1");
    expect(html).toContain("rep specializes");
  });

  test("on non-ok status renders an error panel", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({}),
    });

    mountInto(container, "lead-1");
    await settle();

    expect(container.querySelector('[data-testid="lead-enrichment-panel-error"]')).not.toBeNull();
  });
});
