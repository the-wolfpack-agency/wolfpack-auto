/**
 * @jest-environment jsdom
 *
 * FAQAccordion structural + interactive tests.
 *
 * SSR pass: rendered via react-dom/server to pin the initial DOM —
 *   collapsed by default, correct aria attributes.
 *
 * Interactive pass: mounted with react-dom/client into jsdom and
 *   clicked to verify toggle behavior + onToggle callback. We use
 *   the synchronous-flushing approach (`flushSync`) so we can read
 *   the DOM state immediately after dispatching the click event,
 *   without pulling in @testing-library/react.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import { renderToStaticMarkup } from "react-dom/server";
import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import { act } from "react";
import FAQAccordion, { type FAQAccordionItem } from "../FAQAccordion";

const items: FAQAccordionItem[] = [
  { id: "alpha", question: "What is Alpha?", answer: "Alpha is the first." },
  { id: "beta", question: "What is Beta?", answer: "Beta is the second." },
  { id: "gamma", question: "What is Gamma?", answer: "Gamma is the third." },
];

describe("FAQAccordion — SSR markup", () => {
  test("renders every question", () => {
    const html = renderToStaticMarkup(<FAQAccordion items={items} />);
    expect(html).toContain("What is Alpha?");
    expect(html).toContain("What is Beta?");
    expect(html).toContain("What is Gamma?");
  });

  test("every panel starts collapsed (aria-expanded='false', hidden attribute on dd)", () => {
    const html = renderToStaticMarkup(<FAQAccordion items={items} />);
    const expandedFalse = (html.match(/aria-expanded="false"/g) || []).length;
    expect(expandedFalse).toBe(items.length);
    // Each dd is hidden initially. React 18 emits hidden="" for the boolean attribute.
    const hiddenCount = (html.match(/<dd[^>]*hidden=""/g) || []).length;
    expect(hiddenCount).toBe(items.length);
  });

  test("each button has aria-controls pointing at a matching panel id", () => {
    const html = renderToStaticMarkup(<FAQAccordion items={items} />);
    // Extract aria-controls values; every one of them must appear as an id="..." elsewhere.
    const controlMatches = Array.from(html.matchAll(/aria-controls="([^"]+)"/g)).map(
      (m) => m[1],
    );
    expect(controlMatches.length).toBe(items.length);
    for (const id of controlMatches) {
      expect(html).toContain(`id="${id}"`);
    }
  });

  test("each row has a data-faq-item marker for downstream test/QA hooks", () => {
    const html = renderToStaticMarkup(<FAQAccordion items={items} />);
    expect(html).toContain('data-faq-item="alpha"');
    expect(html).toContain('data-faq-item="beta"');
    expect(html).toContain('data-faq-item="gamma"');
  });
});

describe("FAQAccordion — interactive (jsdom)", () => {
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

  function mount(children: React.ReactNode) {
    act(() => {
      root.render(children);
    });
  }

  function findButton(id: string): HTMLButtonElement {
    const row = container.querySelector(`[data-faq-item="${id}"]`);
    if (!row) throw new Error(`row not found for ${id}`);
    const btn = row.querySelector("button");
    if (!btn) throw new Error(`button not found in row ${id}`);
    return btn as HTMLButtonElement;
  }

  function findPanel(id: string): HTMLElement {
    const row = container.querySelector(`[data-faq-item="${id}"]`);
    if (!row) throw new Error(`row not found for ${id}`);
    const dd = row.querySelector("dd");
    if (!dd) throw new Error(`dd not found in row ${id}`);
    return dd as HTMLElement;
  }

  test("clicking a question expands its panel; aria-expanded becomes 'true'", () => {
    mount(<FAQAccordion items={items} />);
    const btn = findButton("alpha");
    expect(btn.getAttribute("aria-expanded")).toBe("false");
    expect(findPanel("alpha").hasAttribute("hidden")).toBe(true);

    act(() => {
      flushSync(() => {
        btn.click();
      });
    });

    expect(btn.getAttribute("aria-expanded")).toBe("true");
    expect(findPanel("alpha").hasAttribute("hidden")).toBe(false);
  });

  test("clicking again collapses the panel", () => {
    mount(<FAQAccordion items={items} />);
    const btn = findButton("beta");
    act(() => {
      flushSync(() => btn.click());
    });
    expect(btn.getAttribute("aria-expanded")).toBe("true");
    act(() => {
      flushSync(() => btn.click());
    });
    expect(btn.getAttribute("aria-expanded")).toBe("false");
    expect(findPanel("beta").hasAttribute("hidden")).toBe(true);
  });

  test("multiple panels can be open at once (disclosure pattern, not single-select)", () => {
    mount(<FAQAccordion items={items} />);
    act(() => {
      flushSync(() => findButton("alpha").click());
    });
    act(() => {
      flushSync(() => findButton("gamma").click());
    });
    expect(findButton("alpha").getAttribute("aria-expanded")).toBe("true");
    expect(findButton("beta").getAttribute("aria-expanded")).toBe("false");
    expect(findButton("gamma").getAttribute("aria-expanded")).toBe("true");
  });

  test("Enter key on a focused button toggles the panel (native button behavior)", () => {
    mount(<FAQAccordion items={items} />);
    const btn = findButton("alpha");
    btn.focus();
    expect(document.activeElement).toBe(btn);

    // Native <button> elements respond to Enter via click, not keydown. We
    // dispatch a click to mirror what the browser does when Enter is pressed.
    act(() => {
      flushSync(() => {
        btn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
    });
    expect(btn.getAttribute("aria-expanded")).toBe("true");
  });

  test("onToggle callback fires with (id, open) on each toggle", () => {
    const onToggle = jest.fn();
    mount(<FAQAccordion items={items} onToggle={onToggle} />);

    act(() => {
      flushSync(() => findButton("alpha").click());
    });
    expect(onToggle).toHaveBeenLastCalledWith("alpha", true);

    act(() => {
      flushSync(() => findButton("alpha").click());
    });
    expect(onToggle).toHaveBeenLastCalledWith("alpha", false);

    expect(onToggle).toHaveBeenCalledTimes(2);
  });

  test("Tab order: each button is focusable via native focus()", () => {
    mount(<FAQAccordion items={items} />);
    const buttons = Array.from(container.querySelectorAll("button"));
    expect(buttons.length).toBe(items.length);
    for (const b of buttons) {
      (b as HTMLButtonElement).focus();
      expect(document.activeElement).toBe(b);
      // No tabindex="-1" forced on any of them
      expect(b.getAttribute("tabindex")).not.toBe("-1");
    }
  });
});
