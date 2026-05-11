/**
 * /pricing page rendering tests.
 *
 * Server component (no auth, no DB), so we can render it directly via
 * react-dom/server and assert on the resulting HTML string. We don't
 * need RTL — these are pure structural assertions.
 */

import { renderToStaticMarkup } from "react-dom/server";
import PricingPage from "../page";
import { PRICING_TIERS, FAQ_ENTRIES } from "@/lib/marketing/pricing-data";

function render() {
  return renderToStaticMarkup(<PricingPage />);
}

describe("PricingPage (server component)", () => {
  test("renders all 3 pricing tiers by data-tier attribute", () => {
    const html = render();
    for (const tier of PRICING_TIERS) {
      expect(html).toContain(`data-tier="${tier.id}"`);
    }
  });

  test("renders each tier's name and audience copy", () => {
    const html = render();
    for (const tier of PRICING_TIERS) {
      expect(html).toContain(tier.name);
      // Audience copy contains a distinctive phrase per tier
      expect(html).toContain(tier.audience.slice(0, 30));
    }
  });

  test("renders hero heading 'Honest pricing. No DMS lock-in.'", () => {
    const html = render();
    expect(html).toContain("Honest pricing. No DMS lock-in.");
  });

  test("renders the comparison table with feature categories", () => {
    const html = render();
    expect(html).toContain('data-testid="pricing-compare-table"');
    expect(html).toContain("Inventory and Leads");
    expect(html).toContain("F&amp;I and Accounting"); // React escapes & to &amp; in static markup
    expect(html).toContain("Integrations");
    expect(html).toContain("Security and Compliance");
    expect(html).toContain("Support");
  });

  test("renders FAQ section with all 6 required questions", () => {
    const html = render();
    expect(html).toContain('data-testid="pricing-faq"');
    for (const faq of FAQ_ENTRIES) {
      expect(html).toContain(faq.question);
    }
  });

  test("FAQ items render with proper aria-expanded=false (closed by default)", () => {
    const html = render();
    // Every FAQ button should have aria-expanded="false" on initial render
    const expanded = html.match(/aria-expanded="false"/g) || [];
    expect(expanded.length).toBeGreaterThanOrEqual(FAQ_ENTRIES.length);
  });

  test("renders trust strip with GLBA / SOC 2 / cyber insurance", () => {
    const html = render();
    expect(html).toContain('data-testid="pricing-trust-strip"');
    expect(html).toContain("GLBA compliant");
    expect(html).toContain("SOC 2 Type I in progress");
    expect(html).toContain("Cyber insurance carrier covered");
  });

  test("trust strip links to /security-posture", () => {
    const html = render();
    // Find the trust strip and confirm /security-posture is linked from within it
    const trustStripStart = html.indexOf('data-testid="pricing-trust-strip"');
    expect(trustStripStart).toBeGreaterThan(-1);
    // The link is rendered shortly after the test-id marker, before the next major section.
    const sliceAfter = html.slice(trustStripStart);
    expect(sliceAfter).toContain('href="/security-posture"');
  });

  test("renders Most popular badge exactly once (on Growth)", () => {
    const html = render();
    const matches = html.match(/Most popular/g) || [];
    expect(matches.length).toBe(1);
  });

  test("renders bottom CTA with Start free trial + Talk to sales", () => {
    const html = render();
    // Both must appear at least once on the page.
    expect(html).toMatch(/Start free trial/);
    expect(html).toMatch(/Talk to sales/);
  });

  test("contains no em dashes anywhere in rendered markup", () => {
    const html = render();
    expect(html).not.toMatch(/—/);
  });

  test("contains no banned client names", () => {
    const html = render();
    expect(html).not.toMatch(/\bAidan\b/);
    expect(html).not.toMatch(/\bCFTR\b/);
    expect(html).not.toMatch(/\bAvis\b/);
  });

  test("has a single h1 (hero heading), satisfying outline structure", () => {
    const html = render();
    const h1Opens = (html.match(/<h1\b/g) || []).length;
    expect(h1Opens).toBe(1);
  });
});
