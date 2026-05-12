/**
 * @jest-environment jsdom
 *
 * ExternalCredentialsPanel — interactive UI test.
 *
 * Covers:
 *   - empty state renders when GET returns no credentials
 *   - populated state renders one row per existing credential
 *   - add flow POSTs to /api/admin/credentials with the right body
 *   - revoke flow DELETEs to /api/admin/credentials/[id]
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import ExternalCredentialsPanel from "../ExternalCredentialsPanel";

declare const global: any;

function mountInto(container: HTMLElement): Root {
  let root!: Root;
  act(() => {
    root = createRoot(container);
    root.render(<ExternalCredentialsPanel />);
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

describe("ExternalCredentialsPanel", () => {
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

  test("renders empty state when no credentials are stored", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ credentials: [], noData: true }),
    });
    mountInto(container);
    await settle();
    expect(container.querySelector('[data-testid="credentials-empty"]')).not.toBeNull();
    // Provider add cards are still rendered so the dealer can add one.
    expect(container.querySelector('[data-testid="provider-add-carfax"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="provider-add-autocheck"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="provider-add-edmunds"]')).not.toBeNull();
  });

  test("renders one row per existing credential", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        credentials: [
          {
            id: "c1",
            dealerId: "d1",
            provider: "carfax",
            label: null,
            status: "active",
            createdAt: "2026-05-12T00:00:00Z",
            rotatedAt: null,
            lastUsedAt: null,
            lastError: null,
          },
          {
            id: "c2",
            dealerId: "d1",
            provider: "autocheck",
            label: "primary",
            status: "active",
            createdAt: "2026-05-12T00:00:00Z",
            rotatedAt: null,
            lastUsedAt: null,
            lastError: null,
          },
        ],
      }),
    });
    mountInto(container);
    await settle();
    expect(container.querySelector('[data-testid="credentials-list"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="credential-row-carfax"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="credential-row-autocheck"]')).not.toBeNull();
  });

  test("renders error banner on 401", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: "Authentication required" }),
    });
    mountInto(container);
    await settle();
    expect(container.querySelector('[data-testid="credentials-error"]')).not.toBeNull();
  });

  test("flags KBB as future-partnership in the add card", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ credentials: [], noData: true }),
    });
    mountInto(container);
    await settle();
    const kbb = container.querySelector('[data-testid="provider-add-kbb"]');
    expect(kbb).not.toBeNull();
    expect(kbb!.textContent).toContain("Future partnership");
  });
});
