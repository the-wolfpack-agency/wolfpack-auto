/**
 * @jest-environment jsdom
 *
 * The panel and the sentence an operator sees when data cannot be loaded.
 *
 * Guards the 2026-08-04 production report: `TypeError: Failed to fetch` on
 * /admin/leads was caught and sent to Sentry correctly, but the operator was
 * shown an empty table reading "No leads match your filters" — a false claim
 * about their own pipeline.
 *
 * Rendered with react-dom/client + act to match AdminAuthWatcher.test.tsx.
 * This repo has no React Testing Library and adding one for four assertions
 * is not a dependency worth taking.
 */
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { ErrorState, describeFetchFailure } from "../ErrorState";

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("ErrorState", () => {
  test("announces itself to assistive tech", () => {
    act(() => root.render(<ErrorState title="Unable to load leads" message="m" />));
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
  });

  test("shows the title and the reason", () => {
    act(() =>
      root.render(
        <ErrorState title="Unable to load leads" message="You appear to be offline." />,
      ),
    );
    expect(container.textContent).toContain("Unable to load leads");
    expect(container.textContent).toContain("You appear to be offline.");
  });

  test("offers no retry button when there is nothing to retry", () => {
    act(() => root.render(<ErrorState title="t" message="m" />));
    expect(container.querySelector("button")).toBeNull();
  });

  test("calls onRetry when the operator retries", () => {
    const onRetry = jest.fn();
    act(() => root.render(<ErrorState title="t" message="m" onRetry={onRetry} />));
    const btn = container.querySelector("button");
    expect(btn).not.toBeNull();
    act(() => {
      btn!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});

describe("describeFetchFailure", () => {
  test("401 tells the operator their session ended, not 'unauthorized'", () => {
    expect(describeFetchFailure({ res: { status: 401 } as Response })).toMatch(
      /session has ended/i,
    );
  });

  test("403 is distinguished from 401 — a different fix for the operator", () => {
    expect(describeFetchFailure({ res: { status: 403 } as Response })).toMatch(
      /does not have access/i,
    );
  });

  test("429 tells them to wait rather than to sign in", () => {
    expect(describeFetchFailure({ res: { status: 429 } as Response })).toMatch(
      /too many requests/i,
    );
  });

  test("5xx is reported as a server problem", () => {
    expect(describeFetchFailure({ res: { status: 503 } as Response })).toMatch(
      /server had a problem/i,
    );
  });

  test("an unmapped status still names the number rather than staying silent", () => {
    expect(describeFetchFailure({ res: { status: 418 } as Response })).toContain("418");
  });

  test("a rejected request never surfaces the raw 'Failed to fetch'", () => {
    /* The browser's wording means nothing to a service manager. This is the
       exact string from the Sentry report. */
    const msg = describeFetchFailure({ err: new TypeError("Failed to fetch") });
    expect(msg).not.toMatch(/failed to fetch/i);
    expect(msg).toMatch(/could not reach the server/i);
  });

  test("being offline is called out specifically", () => {
    const spy = jest.spyOn(window.navigator, "onLine", "get").mockReturnValue(false);
    expect(describeFetchFailure({ err: new TypeError("Failed to fetch") })).toMatch(
      /offline/i,
    );
    spy.mockRestore();
  });

  test("an aborted request is not reported as a server fault", () => {
    const err = new Error("aborted");
    err.name = "AbortError";
    expect(describeFetchFailure({ err })).toMatch(/cancelled/i);
  });
});
