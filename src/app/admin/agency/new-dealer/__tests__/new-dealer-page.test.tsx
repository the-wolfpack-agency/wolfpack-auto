/**
 * @jest-environment jsdom
 *
 * /admin/agency/new-dealer — the two failures that made this page unusable.
 *
 * 1. "Click to upload logo" was a bare <div> with cursor-pointer styling and
 *    NO <input type="file"> anywhere in the page. It looked like a control and
 *    did nothing. No API test could catch that: the endpoint was fine, the
 *    markup simply had no way to pick a file.
 *
 * 2. The form could not create a dealer at all, because the endpoint required
 *    role `owner` and every real person holds `admin`. That one is pinned in
 *    src/app/api/admin/dealers/__tests__/agency-role-gate.test.ts.
 *
 * Both are UI-visible and neither was covered, which is why a client was
 * blocked. These render the real page.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import { readFileSync } from "fs";
import { resolve } from "path";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import NewDealerPage from "../page";

declare const global: any;

// React 18 concurrent act() support; without it every state update warns.
(global as any).IS_REACT_ACT_ENVIRONMENT = true;

const PAGE_SRC = readFileSync(resolve(__dirname, "../page.tsx"), "utf8");

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  global.fetch = jest.fn(() =>
    Promise.resolve({
      ok: true,
      status: 201,
      json: () => Promise.resolve({ id: "d1", name: "Acme", slug: "acme" }),
    }),
  );
});

afterEach(() => {
  act(() => root?.unmount());
  container.remove();
  jest.restoreAllMocks();
});

function render() {
  root = createRoot(container);
  act(() => root.render(<NewDealerPage />));
}

/** A File whose type/size we control; jsdom does not read real bytes. */
function makeFile(name: string, type: string, size = 1024): File {
  const f = new File(["x"], name, { type });
  Object.defineProperty(f, "size", { value: size });
  return f;
}

/** Fire a change on the file input with the given files. */
function chooseFile(input: HTMLInputElement, file: File | null) {
  Object.defineProperty(input, "files", {
    value: file ? [file] : [],
    configurable: true,
  });
  act(() => {
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

describe("the logo control is real", () => {
  it("renders an <input type=file>, which the page previously had none of", () => {
    // THE regression. Before the fix this query returned null.
    render();
    const input = container.querySelector<HTMLInputElement>('input[type="file"]');
    expect(input).not.toBeNull();
    expect(input!.getAttribute("data-testid")).toBe("dealer-logo-input");
  });

  it("accepts only the image types the copy promises", () => {
    render();
    const input = container.querySelector<HTMLInputElement>('input[type="file"]')!;
    const accept = input.getAttribute("accept") ?? "";
    expect(accept).toContain("image/png");
    expect(accept).toContain("image/jpeg");
    expect(accept).toContain("image/svg+xml");
  });

  it("is reachable by clicking the visible area, via a label", () => {
    // The area still looks like a drop zone; it has to actually target the input.
    render();
    const input = container.querySelector<HTMLInputElement>('input[type="file"]')!;
    const label = container.querySelector(`label[for="${input.id}"]`);
    expect(input.id).toBeTruthy();
    expect(label).not.toBeNull();
  });

  it("has no click-styled element that does nothing", () => {
    // The original bug in one assertion: cursor-pointer on something inert.
    expect(PAGE_SRC).not.toMatch(
      /<div[^>]*cursor-pointer[^>]*>\s*<div[^>]*>\s*\?\s*<\/div>/,
    );
  });
});

describe("choosing a file", () => {
  it("shows the selected file name", async () => {
    render();
    const input = container.querySelector<HTMLInputElement>('input[type="file"]')!;
    chooseFile(input, makeFile("logo.png", "image/png"));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(container.textContent).toContain("logo.png");
  });

  it("refuses a type the server would reject, and says so", async () => {
    render();
    const input = container.querySelector<HTMLInputElement>('input[type="file"]')!;
    chooseFile(input, makeFile("resume.pdf", "application/pdf"));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
    const err = container.querySelector('[data-testid="dealer-logo-error"]');
    expect(err?.textContent).toMatch(/PNG, JPG, or SVG/i);
  });

  it("refuses a file over 2 MB, matching the copy and the server", async () => {
    render();
    const input = container.querySelector<HTMLInputElement>('input[type="file"]')!;
    chooseFile(input, makeFile("huge.png", "image/png", 3 * 1024 * 1024));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
    const err = container.querySelector('[data-testid="dealer-logo-error"]');
    expect(err?.textContent).toMatch(/under 2 MB/i);
  });
});

describe("submitting", () => {
  it("posts to the dealer endpoint with the typed details", async () => {
    render();
    const name = container.querySelector<HTMLInputElement>("#name")
      ?? container.querySelector<HTMLInputElement>('input[type="text"]')!;
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value",
      )!.set!;
      setter.call(name, "Acme Motors");
      name.dispatchEvent(new Event("input", { bubbles: true }));
    });

    const form = container.querySelector("form")!;
    await act(async () => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      await new Promise((r) => setTimeout(r, 20));
    });

    expect(global.fetch).toHaveBeenCalled();
    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe("/api/admin/dealers");
    expect(init.method).toBe("POST");
    // logo_url travels with the create call, because the dealer row does not
    // exist yet and there is nothing to attach a separate upload to.
    expect(JSON.parse(init.body)).toHaveProperty("logo_url");
  });
});
