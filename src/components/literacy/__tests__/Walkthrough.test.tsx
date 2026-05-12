/**
 * @jest-environment jsdom
 *
 * <Walkthrough> SSR + interaction tests.
 *
 * The component renders a multi-step overlay. We verify:
 *   - SSR markup contains the first step's body, the step counter, and the
 *     Next + Skip buttons (so it works pre-hydration / for screen readers).
 *   - Step advance + dismiss interaction paths fire the documented analytics
 *     events through the onEvent prop.
 */

import { renderToStaticMarkup } from "react-dom/server";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import Walkthrough, { type WalkthroughView } from "../Walkthrough";

const sample: WalkthroughView = {
  id: "wid",
  slug: "first_visit_dash",
  name: "Dashboard intro",
  role: "fi_manager",
  surface: "dashboard",
  trigger_condition: "first_visit",
  steps: [
    { selector: "[data-a]", template: "First step body", position: "bottom" },
    { selector: "[data-b]", template: "Second step body" },
  ],
};

describe("<Walkthrough> — SSR markup", () => {
  const html = renderToStaticMarkup(
    <Walkthrough walkthroughSlug="first_visit_dash" initial={sample} />,
  );

  test("renders the dialog overlay", () => {
    expect(html).toContain('data-testid="walkthrough-overlay"');
    expect(html).toContain('role="dialog"');
  });

  test("renders the first step body", () => {
    expect(html).toContain("First step body");
  });

  test("renders the step counter (Step 1 of 2)", () => {
    expect(html).toContain('data-testid="walkthrough-step-counter"');
    expect(html).toMatch(/Step\s+1\s+of\s+2/);
  });

  test("renders Next + Skip buttons", () => {
    expect(html).toContain('data-testid="walkthrough-next"');
    expect(html).toContain('data-testid="walkthrough-dismiss"');
  });

  test("disables the Back button on step 1", () => {
    expect(html).toMatch(/data-testid="walkthrough-prev"[^>]+disabled/);
  });
});

describe("<Walkthrough> — interaction", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  test("advances to step 2 and fires walkthrough.step_completed", () => {
    const events: Array<[string, Record<string, unknown>]> = [];
    act(() => {
      root.render(
        <Walkthrough
          walkthroughSlug="first_visit_dash"
          initial={sample}
          onEvent={(e, meta) => events.push([e, meta])}
        />,
      );
    });
    const next = container.querySelector<HTMLButtonElement>(
      '[data-testid="walkthrough-next"]',
    );
    expect(next).toBeTruthy();
    act(() => {
      next!.click();
    });
    expect(
      container.querySelector('[data-testid="walkthrough-step-counter"]')
        ?.textContent,
    ).toMatch(/Step\s+2\s+of\s+2/);
    expect(events.some(([e]) => e === "walkthrough.step_completed")).toBe(true);
  });

  test("dismiss button fires walkthrough.dismissed and closes the overlay", () => {
    const events: Array<[string, Record<string, unknown>]> = [];
    act(() => {
      root.render(
        <Walkthrough
          walkthroughSlug="first_visit_dash"
          initial={sample}
          onEvent={(e, meta) => events.push([e, meta])}
        />,
      );
    });
    const skip = container.querySelector<HTMLButtonElement>(
      '[data-testid="walkthrough-dismiss"]',
    );
    expect(skip).toBeTruthy();
    act(() => {
      skip!.click();
    });
    expect(events.some(([e]) => e === "walkthrough.dismissed")).toBe(true);
    expect(
      container.querySelector('[data-testid="walkthrough-overlay"]'),
    ).toBeNull();
  });

  test("clicking Next on the final step fires walkthrough.completed and calls onComplete", () => {
    const events: Array<[string, Record<string, unknown>]> = [];
    const onComplete = jest.fn();
    act(() => {
      root.render(
        <Walkthrough
          walkthroughSlug="first_visit_dash"
          initial={sample}
          onComplete={onComplete}
          onEvent={(e, meta) => events.push([e, meta])}
        />,
      );
    });
    // Advance to step 2
    act(() => {
      container
        .querySelector<HTMLButtonElement>('[data-testid="walkthrough-next"]')!
        .click();
    });
    // Advance past final step
    act(() => {
      container
        .querySelector<HTMLButtonElement>('[data-testid="walkthrough-next"]')!
        .click();
    });
    expect(events.some(([e]) => e === "walkthrough.completed")).toBe(true);
    expect(onComplete).toHaveBeenCalledWith("first_visit_dash");
  });
});
