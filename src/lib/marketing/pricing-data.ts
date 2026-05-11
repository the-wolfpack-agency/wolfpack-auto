/**
 * Pricing tiers + FAQ + feature matrix for the public /pricing page.
 *
 * Single source of truth. Imported by:
 *   - src/app/pricing/page.tsx           (server component)
 *   - src/components/marketing/PricingTable.tsx  (client component)
 *   - src/lib/marketing/__tests__/pricing-data.test.ts (data contract)
 *
 * Why a separate module: the tier list is the contract. Tests pin the
 * names, prices, "most popular" badge, feature counts, and CTA labels
 * so a copy edit cannot silently drop a tier or rename a CTA.
 *
 * No client names. No em dashes. No competitor names in user-facing copy
 * (the "Can I switch from CDK" FAQ is intentional — that's an inbound
 * question dealers actually ask, not us naming competitors as positioning).
 */

export type PricingTierId = "starter" | "growth" | "enterprise";

export interface PricingTier {
  id: PricingTierId;
  name: string;
  /** Monthly price (USD) for monthly billing. Null = "Contact us". */
  monthlyPrice: number | null;
  /** Per-rooftop monthly price after annual discount (~20% off). Null = "Contact us". */
  annualMonthlyPrice: number | null;
  /** Human label when there's no numeric price. */
  priceCustomLabel?: string;
  /** Short audience description ("who it's for"). */
  audience: string;
  /** Marketing bullets shown on the card. */
  features: string[];
  /** Primary call-to-action button label + href. */
  cta: { label: string; href: string };
  /** Most-popular badge on this tier. */
  popular?: boolean;
}

export const PRICING_TIERS: readonly PricingTier[] = [
  {
    id: "starter",
    name: "Starter",
    monthlyPrice: 499,
    annualMonthlyPrice: 399,
    audience:
      "Independent dealers with up to 100 vehicles in inventory who want one place for inventory, leads, and reporting.",
    features: [
      "Up to 100 vehicles in inventory",
      "Lead capture, scoring, and pipeline",
      "Inventory search with photos and CARFAX",
      "Customer CRM with notes and tasks",
      "Basic reporting (inventory aging, lead funnel)",
      "Email delivery via your domain",
      "Standard email support (next business day)",
      "Up to 5 user seats per rooftop",
    ],
    cta: { label: "Start free trial", href: "/contact?plan=starter" },
  },
  {
    id: "growth",
    name: "Growth",
    monthlyPrice: 1499,
    annualMonthlyPrice: 1199,
    audience:
      "Independent and small franchise stores ready to add F&I desking, GL, and live DMS data ingest.",
    features: [
      "Everything in Starter",
      "Unlimited vehicles per rooftop",
      "F&I desking and deal jacket",
      "General ledger and deal accounting",
      "DMS feed ingest (CDK, Reynolds, Dealertrack)",
      "Advanced analytics and behavioral brain",
      "Service and parts module",
      "Priority support with a named CSM",
    ],
    cta: { label: "Start free trial", href: "/contact?plan=growth" },
    popular: true,
  },
  {
    id: "enterprise",
    name: "Enterprise",
    monthlyPrice: null,
    annualMonthlyPrice: null,
    priceCustomLabel: "Contact us",
    audience:
      "Multi-rooftop groups that need SSO, custom integrations, and contractual uptime guarantees.",
    features: [
      "Everything in Growth",
      "Multi-rooftop groups and multi-company GL",
      "SSO and SAML (Okta, Azure AD, Google)",
      "Custom integrations and webhook fan-out",
      "Dedicated customer success manager",
      "SOC 2 evidence package and DPA",
      "Uptime SLA (99.9%) with credits",
      "Annual contract with volume pricing",
    ],
    cta: { label: "Talk to sales", href: "/contact?plan=enterprise" },
  },
];

/** Feature comparison matrix. Each row is a feature, each tier is "yes" / "no" / a value string. */
export interface ComparisonRow {
  category: string;
  feature: string;
  starter: string | true | false;
  growth: string | true | false;
  enterprise: string | true | false;
}

export const COMPARISON_ROWS: readonly ComparisonRow[] = [
  // Inventory + leads
  { category: "Inventory and Leads", feature: "Vehicles per rooftop", starter: "Up to 100", growth: "Unlimited", enterprise: "Unlimited" },
  { category: "Inventory and Leads", feature: "Lead capture and pipeline", starter: true, growth: true, enterprise: true },
  { category: "Inventory and Leads", feature: "Lead scoring (ML)", starter: false, growth: true, enterprise: true },
  { category: "Inventory and Leads", feature: "Inventory search with CARFAX", starter: true, growth: true, enterprise: true },
  // F&I + accounting
  { category: "F&I and Accounting", feature: "F&I desking", starter: false, growth: true, enterprise: true },
  { category: "F&I and Accounting", feature: "General ledger", starter: false, growth: true, enterprise: true },
  { category: "F&I and Accounting", feature: "Multi-company GL", starter: false, growth: false, enterprise: true },
  { category: "F&I and Accounting", feature: "Stripe payments", starter: false, growth: true, enterprise: true },
  // Integrations
  { category: "Integrations", feature: "DMS feed ingest", starter: false, growth: true, enterprise: true },
  { category: "Integrations", feature: "Outbound webhooks", starter: false, growth: true, enterprise: true },
  { category: "Integrations", feature: "Custom integrations", starter: false, growth: false, enterprise: true },
  // Security
  { category: "Security and Compliance", feature: "SSO / SAML", starter: false, growth: false, enterprise: true },
  { category: "Security and Compliance", feature: "MFA (TOTP)", starter: true, growth: true, enterprise: true },
  { category: "Security and Compliance", feature: "SOC 2 evidence package", starter: false, growth: false, enterprise: true },
  { category: "Security and Compliance", feature: "DPA on request", starter: false, growth: true, enterprise: true },
  // Support
  { category: "Support", feature: "Email support", starter: "Next business day", growth: "Priority", enterprise: "Priority" },
  { category: "Support", feature: "Named CSM", starter: false, growth: true, enterprise: "Dedicated" },
  { category: "Support", feature: "Uptime SLA", starter: false, growth: false, enterprise: "99.9%" },
  { category: "Support", feature: "User seats per rooftop", starter: "5", growth: "25", enterprise: "Unlimited" },
];

export interface FaqEntry {
  id: string;
  question: string;
  answer: string;
}

export const FAQ_ENTRIES: readonly FaqEntry[] = [
  {
    id: "switch-from-other-dms",
    question: "Can I switch from my current DMS (CDK, Reynolds, Dealertrack)?",
    answer:
      "Yes. Our DMS ingest layer reads feeds from the major providers and normalizes them into our canonical inventory and deal shapes. The typical switch takes 4 to 6 weeks: feed connection in week 1, parallel run in weeks 2 to 4, then cutover. Your historical data stays accessible the whole time.",
  },
  {
    id: "data-on-exit",
    question: "What happens to my data if I cancel?",
    answer:
      "Your data is yours. On cancellation we provide a full export of inventory, leads, deals, GL entries, and audit logs in CSV and JSON formats within 30 days. We retain a copy for 90 days in case you want to come back, then it is permanently deleted. This is written into every contract.",
  },
  {
    id: "setup-fee",
    question: "Is there a setup fee?",
    answer:
      "Starter has no setup fee. Growth includes a one-time onboarding package (DMS feed configuration, user provisioning, training) at no additional charge for the first rooftop. Enterprise includes white-glove implementation with a dedicated CSM and is quoted with the annual contract.",
  },
  {
    id: "oem-integrations",
    question: "Do you support OEM-required integrations?",
    answer:
      "Yes, on Growth and Enterprise. We integrate with OEM program management for incentives, certified pre-owned validation, and warranty registration. New OEM integrations are quoted as part of Enterprise contracts; existing OEM connectors are included on Growth.",
  },
  {
    id: "implementation-timeline",
    question: "What is the implementation timeline?",
    answer:
      "Starter: same-day signup with a 4-step setup wizard. Growth: 2 to 4 weeks including DMS feed connection, GL chart-of-accounts setup, and user training. Enterprise: 6 to 12 weeks for multi-rooftop rollouts with SSO, custom integrations, and parallel-run validation.",
  },
  {
    id: "multi-rooftop",
    question: "Do you support multi-rooftop groups?",
    answer:
      "Yes, on Enterprise. Multi-rooftop groups get consolidated reporting across stores, multi-company GL with intercompany eliminations, SSO that spans all rooftops, and a shared customer record so a lead at one store is recognized at another. Pricing is per-rooftop with volume discounts above 5 rooftops.",
  },
];

/** Annual discount (display only — actual billing logic lives in Stripe). */
export const ANNUAL_DISCOUNT_LABEL = "Save 20% with annual billing";

/** Helper: given billing toggle, return the displayed price for a tier. */
export function displayedPrice(tier: PricingTier, annual: boolean): { value: string; suffix: string } {
  if (tier.monthlyPrice === null) {
    return { value: tier.priceCustomLabel || "Contact us", suffix: "" };
  }
  const price = annual ? tier.annualMonthlyPrice : tier.monthlyPrice;
  if (price === null) {
    return { value: tier.priceCustomLabel || "Contact us", suffix: "" };
  }
  return {
    value: `$${price.toLocaleString()}`,
    suffix: annual ? "/mo per rooftop, billed annually" : "/mo per rooftop",
  };
}
