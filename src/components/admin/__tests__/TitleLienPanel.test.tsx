/**
 * @jest-environment jsdom
 *
 * TitleLienPanel — UI test.
 *
 * Asserts the four required render branches per Stream E spec:
 *   1. Loading
 *   2. Valid (supported + has_lien === false)
 *   3. Lien present (supported + has_lien === true)
 *   4. Not supported (supported === false)
 *
 * Plus: no em dashes in user-visible copy (`feedback_no_em_dashes.md`).
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { TitleLienPanel } from "@/components/admin/TitleLienPanel";

declare const global: any;

function mount(container: HTMLElement, vehicleId: string): Root {
  let root!: Root;
  act(() => {
    root = createRoot(container);
    root.render(<TitleLienPanel vehicleId={vehicleId} />);
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

describe("TitleLienPanel", () => {
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

  test("renders the loading state initially", async () => {
    let resolveFetch!: (v: any) => void;
    global.fetch = jest.fn(
      () =>
        new Promise((res) => {
          resolveFetch = res;
        }),
    );
    mount(container, "veh-1");
    expect(
      container.querySelector('[data-testid="title-lien-loading"]'),
    ).not.toBeNull();
    resolveFetch({
      ok: true,
      status: 200,
      json: async () => ({
        vehicle_id: "veh-1",
        vin: "VIN",
        state_code: "FL",
        supported: false,
        reason: "paid_subscription_required",
        has_lien: null,
        lienholder_name: null,
        title_status: null,
        source: "unsupported",
        looked_up_at: new Date().toISOString(),
        supported_states: ["CA", "TX", "FL"],
      }),
    });
    await settle();
  });

  test("renders the not-supported branch when supported is false", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        vehicle_id: "veh-1",
        vin: "VIN",
        state_code: "FL",
        supported: false,
        reason: "paid_subscription_required",
        has_lien: null,
        lienholder_name: null,
        title_status: null,
        source: "unsupported",
        looked_up_at: new Date().toISOString(),
        supported_states: ["CA", "TX", "FL"],
      }),
    });
    mount(container, "veh-1");
    await settle();
    expect(
      container.querySelector('[data-testid="title-lien-not-supported"]'),
    ).not.toBeNull();
    // No em dashes in user-visible copy
    expect(container.textContent).not.toContain("—");
  });

  test("renders the lien-present branch when has_lien is true", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        vehicle_id: "veh-1",
        vin: "VIN",
        state_code: "FL",
        supported: true,
        has_lien: true,
        lienholder_name: "BANK OF AMERICA",
        title_status: "CLEAN",
        source: "fl_flhsmv",
        looked_up_at: new Date().toISOString(),
        supported_states: ["CA", "TX", "FL"],
      }),
    });
    mount(container, "veh-1");
    await settle();
    expect(
      container.querySelector('[data-testid="title-lien-has-lien"]'),
    ).not.toBeNull();
    expect(container.textContent).toContain("BANK OF AMERICA");
    expect(container.textContent).toContain("Lien on file");
  });

  test("renders the valid branch when supported + has_lien is false", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        vehicle_id: "veh-1",
        vin: "VIN",
        state_code: "FL",
        supported: true,
        has_lien: false,
        lienholder_name: null,
        title_status: "CLEAN",
        source: "fl_flhsmv",
        looked_up_at: new Date().toISOString(),
        supported_states: ["CA", "TX", "FL"],
      }),
    });
    mount(container, "veh-1");
    await settle();
    expect(
      container.querySelector('[data-testid="title-lien-valid"]'),
    ).not.toBeNull();
    expect(container.textContent).toContain("No lien recorded");
  });

  test("does not render valid/lien/not-supported branches on 401", async () => {
    // window.location is read-only in jsdom; instead of asserting the redirect
    // target we assert that NONE of the data-bearing branches render when the
    // API returns 401 — i.e. the user does not see a stale/blank dashboard.
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: "Authentication required" }),
    });
    mount(container, "veh-1");
    await settle();
    expect(
      container.querySelector('[data-testid="title-lien-valid"]'),
    ).toBeNull();
    expect(
      container.querySelector('[data-testid="title-lien-has-lien"]'),
    ).toBeNull();
    expect(
      container.querySelector('[data-testid="title-lien-not-supported"]'),
    ).toBeNull();
  });
});
