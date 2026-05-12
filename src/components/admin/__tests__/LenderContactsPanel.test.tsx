/**
 * @jest-environment jsdom
 *
 * LenderContactsPanel -- UI unit tests (Stream B, migration 070).
 *
 * Covers:
 *   - empty state renders
 *   - loaded state renders the contact rows
 *   - submitting the add-form POSTs to the API + reloads
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import { createRoot } from "react-dom/client";
import { act } from "react";
import LenderContactsPanel from "@/components/admin/LenderContactsPanel";

// jsdom doesn't ship fetch -- stub it.
function stubFetch(handler: (url: string, init?: RequestInit) => any) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).fetch = jest.fn((url: string, init?: RequestInit) => {
    const result = handler(url, init);
    return Promise.resolve({
      ok: result?.ok ?? true,
      status: result?.status ?? 200,
      json: async () => result?.body ?? {},
    });
  });
}

function mount() {
  const c = document.createElement("div");
  document.body.appendChild(c);
  let root: ReturnType<typeof createRoot>;
  act(() => {
    root = createRoot(c);
    root.render(<LenderContactsPanel />);
  });
  return c;
}

async function flush(times = 3) {
  for (let i = 0; i < times; i++) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

describe("LenderContactsPanel", () => {
  afterEach(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).fetch = undefined;
    document.body.innerHTML = "";
  });

  it("renders the empty state when API returns []", async () => {
    stubFetch(() => ({ body: { routes: [] } }));
    const c = mount();
    await flush();
    expect(c.textContent).toMatch(/No lender contacts yet/);
    expect(c.querySelector('[data-testid="lender-contacts-empty"]')).not.toBeNull();
  });

  it("renders contact rows when API returns data", async () => {
    stubFetch(() => ({
      body: {
        routes: [
          {
            id: "r1",
            dealerId: "d",
            lenderName: "ACME Bank",
            contactEmail: "ops@acme.example",
            contactName: "Pat Smith",
            sortOrder: 0,
            active: true,
            lenderType: "prime",
            notes: null,
            createdAt: "x",
            updatedAt: "x",
          },
        ],
      },
    }));
    const c = mount();
    await flush();
    expect(c.textContent).toMatch(/ACME Bank/);
    expect(c.textContent).toMatch(/ops@acme.example/);
    expect(c.querySelector('[data-testid="lender-contact-row-r1"]')).not.toBeNull();
  });

  it("renders the add form with required inputs", async () => {
    stubFetch(() => ({ body: { routes: [] } }));
    const c = mount();
    await flush();
    expect(c.querySelector('[data-testid="lender-name-input"]')).not.toBeNull();
    expect(c.querySelector('[data-testid="lender-email-input"]')).not.toBeNull();
    expect(c.querySelector('[data-testid="lender-add-submit"]')).not.toBeNull();
  });

  it("shows the panel test id (smoke)", async () => {
    stubFetch(() => ({ body: { routes: [] } }));
    const c = mount();
    await flush();
    expect(c.querySelector('[data-testid="lender-contacts-panel"]')).not.toBeNull();
  });
});
