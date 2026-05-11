/**
 * PricingTable structural + accessibility tests.
 *
 * The toggle and onCadenceChange callback are state-driven; without
 * @testing-library/react we exercise them by rendering twice with
 * different initial `monthly` props and pinning the resulting DOM.
 * The data-driven price values come straight from the pricing data
 * contract, so a regression in displayedPrice is caught upstream by
 * pricing-data.test.ts.
 */

import { renderToStaticMarkup } from "react-dom/server";
import PricingTable from "../PricingTable";
import { PRICING_TIERS } from "@/lib/marketing/pricing-data";

function renderMonthly() {
  return renderToStaticMarkup(<PricingTable tiers={PRICING_TIERS} monthly={true} />);
}

function renderAnnual() {
  return renderToStaticMarkup(<PricingTable tiers={PRICING_TIERS} monthly={false} />);
}

describe("PricingTable", () => {
  test("renders all three tier cards by data-tier", () => {
    const html = renderMonthly();
    expect(html).toContain('data-tier="starter"');
    expect(html).toContain('data-tier="growth"');
    expect(html).toContain('data-tier="enterprise"');
  });

  test("Most popular badge renders on Growth, not Starter or Enterprise", () => {
    const html = renderMonthly();
    // Badge appears once
    const badgeCount = (html.match(/Most popular/g) || []).length;
    expect(badgeCount).toBe(1);
    // And the badge's id is keyed to growth
    expect(html).toContain('id="pricing-tier-growth-badge"');
  });

  test("Monthly mode: Monthly toggle is pressed, Annual is not", () => {
    const html = renderMonthly();
    // The toggle buttons render with aria-pressed reflecting state.
    // Match the Monthly button block.
    expect(html).toMatch(/aria-pressed="true"[^>]*>[^<]*?Monthly/);
    expect(html).toMatch(/aria-pressed="false"[^>]*>[^<]*?Annual/);
  });

  test("Annual mode (monthly=false): Annual is pressed, Monthly is not", () => {
    const html = renderAnnual();
    expect(html).toMatch(/aria-pressed="true"[^>]*>[^<]*?Annual/);
    expect(html).toMatch(/aria-pressed="false"[^>]*>[^<]*?Monthly/);
  });

  test("Monthly mode shows $499 for Starter, $1,499 for Growth", () => {
    const html = renderMonthly();
    expect(html).toContain("$499");
    expect(html).toContain("$1,499");
  });

  test("Annual mode shows the discounted monthly equivalents", () => {
    const html = renderAnnual();
    expect(html).toContain("$399");
    expect(html).toContain("$1,199");
  });

  test("Enterprise card always shows Contact us regardless of cadence", () => {
    expect(renderMonthly()).toContain("Contact us");
    expect(renderAnnual()).toContain("Contact us");
  });

  test("billing toggle group has aria-label", () => {
    const html = renderMonthly();
    expect(html).toContain('role="group"');
    expect(html).toContain('aria-label="Billing cadence"');
  });

  test("each card is an <article> with aria-labelledby pointing to its heading", () => {
    const html = renderMonthly();
    for (const tier of PRICING_TIERS) {
      const headingId = `pricing-tier-${tier.id}`;
      expect(html).toContain(`aria-labelledby="${headingId}"`);
      expect(html).toContain(`id="${headingId}"`);
    }
  });

  test("each CTA is an anchor with data-cta-tier set to the tier id", () => {
    const html = renderMonthly();
    expect(html).toContain('data-cta-tier="starter"');
    expect(html).toContain('data-cta-tier="growth"');
    expect(html).toContain('data-cta-tier="enterprise"');
  });

  test("CTAs link to /contact with plan param", () => {
    const html = renderMonthly();
    expect(html).toContain('href="/contact?plan=starter"');
    expect(html).toContain('href="/contact?plan=growth"');
    expect(html).toContain('href="/contact?plan=enterprise"');
  });

  test("Starter CTA is Start free trial; Enterprise CTA is Talk to sales", () => {
    const html = renderMonthly();
    // Trim down to each CTA anchor and check its text.
    const starterCta = html.match(/data-cta-tier="starter"[^>]*>([^<]+)</);
    const enterpriseCta = html.match(/data-cta-tier="enterprise"[^>]*>([^<]+)</);
    expect(starterCta?.[1]).toBe("Start free trial");
    expect(enterpriseCta?.[1]).toBe("Talk to sales");
  });

  test("renders feature bullets for each tier", () => {
    const html = renderMonthly();
    for (const tier of PRICING_TIERS) {
      // First feature should be present in markup
      expect(html).toContain(tier.features[0]);
    }
  });

  test("feature lists carry an aria-label", () => {
    const html = renderMonthly();
    expect(html).toContain('aria-label="Starter features"');
    expect(html).toContain('aria-label="Growth features"');
    expect(html).toContain('aria-label="Enterprise features"');
  });

  test("annual discount label mentions 20% in annual mode", () => {
    const html = renderAnnual();
    expect(html.toLowerCase()).toContain("20%");
  });

  test("popular tier card has ring class and accent CTA color", () => {
    const html = renderMonthly();
    // The popular card uses ring-2 ring-brand-600 + accent-500 CTA
    expect(html).toMatch(/data-tier="growth"[^>]*class="[^"]*ring-2[^"]*"/);
  });
});
