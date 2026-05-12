/**
 * @jest-environment jsdom
 *
 * <OntologyTooltip> SSR markup test.
 *
 * The tooltip uses the native <details>/<summary> pattern so the disclosure
 * works pre-hydration and is accessible. We verify the short text shows in
 * the <summary> and the expanded text is present inside <details>.
 */

import { renderToStaticMarkup } from "react-dom/server";
import OntologyTooltip, { type TooltipView } from "../OntologyTooltip";

const tooltip: TooltipView = {
  id: "tid",
  concept_id: "cid",
  role: "salesperson",
  short_text: "Short summary line.",
  expanded_text: "Expanded explanation that gives 2-3 sentences of context.",
};

describe("<OntologyTooltip> — SSR markup", () => {
  const html = renderToStaticMarkup(
    <OntologyTooltip
      conceptSlug="vdp_scroll_depth"
      role="salesperson"
      initial={tooltip}
    />,
  );

  test("renders as <details> for native progressive disclosure", () => {
    expect(html).toContain("<details");
    expect(html).toContain("<summary");
    expect(html).toContain('data-testid="ontology-tooltip"');
  });

  test("short text appears inside summary", () => {
    expect(html).toContain('data-testid="ontology-tooltip-summary"');
    expect(html).toContain("Short summary line.");
  });

  test("expanded text is present", () => {
    expect(html).toContain('data-testid="ontology-tooltip-expanded"');
    expect(html).toContain("Expanded explanation");
  });

  test("data-concept-slug + data-role are set for analytics targeting", () => {
    expect(html).toContain('data-concept-slug="vdp_scroll_depth"');
    expect(html).toContain('data-role="salesperson"');
  });

  test("renders placeholder when no initial + no expanded text", () => {
    const placeholderHtml = renderToStaticMarkup(
      <OntologyTooltip
        conceptSlug="x"
        role="salesperson"
        placeholder="Loading tooltip…"
      />,
    );
    expect(placeholderHtml).toContain("Loading tooltip…");
    expect(placeholderHtml).not.toContain(
      'data-testid="ontology-tooltip-expanded"',
    );
  });
});
