/**
 * Pricing data contract tests.
 *
 * Pins the names, prices, popular badge, FAQ count, and pricing helper
 * output. The /pricing page + PricingTable + FAQAccordion all consume
 * this module, so a regression here is caught BEFORE the page or
 * components rerender.
 */

import {
  PRICING_TIERS,
  COMPARISON_ROWS,
  FAQ_ENTRIES,
  ANNUAL_DISCOUNT_LABEL,
  displayedPrice,
} from "../pricing-data";

describe("PRICING_TIERS", () => {
  test("has exactly three tiers in fixed order", () => {
    expect(PRICING_TIERS).toHaveLength(3);
    expect(PRICING_TIERS.map((t) => t.id)).toEqual(["starter", "growth", "enterprise"]);
  });

  test("Starter is $499/mo monthly, ~20% discount annual", () => {
    const starter = PRICING_TIERS.find((t) => t.id === "starter");
    expect(starter).toBeDefined();
    expect(starter!.monthlyPrice).toBe(499);
    expect(starter!.annualMonthlyPrice).toBe(399); // 499 - 20% = 399.20, rounded for marketing
    expect(starter!.popular).toBeFalsy();
  });

  test("Growth is $1,499/mo monthly and is the popular tier", () => {
    const growth = PRICING_TIERS.find((t) => t.id === "growth");
    expect(growth).toBeDefined();
    expect(growth!.monthlyPrice).toBe(1499);
    expect(growth!.annualMonthlyPrice).toBe(1199);
    expect(growth!.popular).toBe(true);
  });

  test("only Growth is flagged popular", () => {
    const popular = PRICING_TIERS.filter((t) => t.popular);
    expect(popular).toHaveLength(1);
    expect(popular[0].id).toBe("growth");
  });

  test("Enterprise is Contact us, not a numeric price", () => {
    const ent = PRICING_TIERS.find((t) => t.id === "enterprise");
    expect(ent).toBeDefined();
    expect(ent!.monthlyPrice).toBeNull();
    expect(ent!.annualMonthlyPrice).toBeNull();
    expect(ent!.priceCustomLabel).toBe("Contact us");
  });

  test("every tier has at least 8 feature bullets", () => {
    for (const tier of PRICING_TIERS) {
      expect(tier.features.length).toBeGreaterThanOrEqual(8);
    }
  });

  test("every tier has a CTA label + href", () => {
    for (const tier of PRICING_TIERS) {
      expect(tier.cta.label.length).toBeGreaterThan(0);
      expect(tier.cta.href.startsWith("/")).toBe(true);
    }
  });

  test("Enterprise CTA is Talk to sales, not Start free trial", () => {
    const ent = PRICING_TIERS.find((t) => t.id === "enterprise")!;
    expect(ent.cta.label).toBe("Talk to sales");
  });

  test("no em dashes in user-facing copy", () => {
    const allCopy: string[] = [];
    for (const tier of PRICING_TIERS) {
      allCopy.push(tier.name, tier.audience, ...tier.features, tier.cta.label);
    }
    for (const piece of allCopy) {
      expect(piece).not.toMatch(/—/); // em dash U+2014
    }
  });

  test("no client names in user-facing copy", () => {
    const banned = ["Aidan", "CFTR", "Avis"];
    const allCopy: string[] = [];
    for (const tier of PRICING_TIERS) {
      allCopy.push(tier.name, tier.audience, ...tier.features, tier.cta.label);
    }
    for (const piece of allCopy) {
      for (const name of banned) {
        expect(piece).not.toContain(name);
      }
    }
  });
});

describe("COMPARISON_ROWS", () => {
  test("non-empty and grouped by category", () => {
    expect(COMPARISON_ROWS.length).toBeGreaterThan(10);
    const categories = new Set(COMPARISON_ROWS.map((r) => r.category));
    expect(categories.size).toBeGreaterThanOrEqual(4);
  });

  test("Multi-company GL is Enterprise-only", () => {
    const row = COMPARISON_ROWS.find((r) => r.feature === "Multi-company GL");
    expect(row).toBeDefined();
    expect(row!.starter).toBe(false);
    expect(row!.growth).toBe(false);
    expect(row!.enterprise).toBe(true);
  });

  test("SSO / SAML is Enterprise-only", () => {
    const row = COMPARISON_ROWS.find((r) => r.feature === "SSO / SAML");
    expect(row).toBeDefined();
    expect(row!.enterprise).toBe(true);
    expect(row!.starter).toBe(false);
    expect(row!.growth).toBe(false);
  });
});

describe("FAQ_ENTRIES", () => {
  test("at least 5 entries", () => {
    expect(FAQ_ENTRIES.length).toBeGreaterThanOrEqual(5);
  });

  test("covers the required questions", () => {
    const ids = FAQ_ENTRIES.map((f) => f.id);
    expect(ids).toContain("switch-from-other-dms");
    expect(ids).toContain("data-on-exit");
    expect(ids).toContain("setup-fee");
    expect(ids).toContain("oem-integrations");
    expect(ids).toContain("implementation-timeline");
    expect(ids).toContain("multi-rooftop");
  });

  test("every FAQ has a non-empty question and answer", () => {
    for (const f of FAQ_ENTRIES) {
      expect(f.question.length).toBeGreaterThan(0);
      expect(f.answer.length).toBeGreaterThan(20);
    }
  });

  test("FAQ ids are unique (required for accordion keying)", () => {
    const ids = FAQ_ENTRIES.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("no em dashes in FAQ copy", () => {
    for (const f of FAQ_ENTRIES) {
      expect(f.question).not.toMatch(/—/);
      expect(f.answer).not.toMatch(/—/);
    }
  });
});

describe("displayedPrice", () => {
  const starter = PRICING_TIERS.find((t) => t.id === "starter")!;
  const ent = PRICING_TIERS.find((t) => t.id === "enterprise")!;

  test("monthly cadence returns formatted monthly price", () => {
    const r = displayedPrice(starter, false);
    expect(r.value).toBe("$499");
    expect(r.suffix).toContain("/mo per rooftop");
  });

  test("annual cadence returns the discounted monthly equivalent", () => {
    const r = displayedPrice(starter, true);
    expect(r.value).toBe("$399");
    expect(r.suffix).toContain("annually");
  });

  test("Enterprise (no numeric price) returns Contact us with no suffix", () => {
    expect(displayedPrice(ent, false)).toEqual({ value: "Contact us", suffix: "" });
    expect(displayedPrice(ent, true)).toEqual({ value: "Contact us", suffix: "" });
  });
});

describe("ANNUAL_DISCOUNT_LABEL", () => {
  test("mentions 20% savings", () => {
    expect(ANNUAL_DISCOUNT_LABEL.toLowerCase()).toContain("20%");
  });
});
