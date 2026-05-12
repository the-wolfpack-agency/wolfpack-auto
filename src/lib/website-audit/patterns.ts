/**
 * Codified scan rules for the Website Audit — the zero-tokens-first asset.
 *
 * Each rule is a pure deterministic function over `ScanResult` (the output
 * of `scanner.ts`). NO AI invocation, NO outbound calls. This is what makes
 * the scan free at infinite scale: every site analyzed by these rules costs
 * zero LLM tokens. AI only enters at the synthesis-to-dealer-language step
 * inside `pdf-generator.ts`'s narrative blocks, and even there only as a
 * lookup-based template renderer, not a free-form generator.
 *
 * 30 rules across six categories: perf, ux, conversion, brand, compliance,
 * mobile. Each carries a dealer-language recommendation and an expected
 * outcome statement so the PDF can render directly off this table.
 *
 * Used by:
 *   - `audit-orchestrator.ts` (apply rules to findings -> triggered list)
 *   - `pdf-generator.ts` (recommendations page 4)
 */

import type { ScanResult } from "@/lib/website-audit/scanner";
import type { LighthouseResult } from "@/lib/website-audit/lighthouse-runner";

export type RuleSeverity = "low" | "medium" | "high" | "critical";

export type RuleCategory =
  | "perf"
  | "ux"
  | "conversion"
  | "brand"
  | "compliance"
  | "mobile";

export interface FindingsContext {
  scan: ScanResult;
  lighthouse: LighthouseResult;
}

export interface WebsiteAuditRule {
  slug: string;
  title: string;
  severity: RuleSeverity;
  category: RuleCategory;
  /** Pure function — returns true when the rule should fire (something is wrong). */
  check: (ctx: FindingsContext) => boolean;
  /** Dealer-language recommendation, rendered verbatim in the PDF + email. */
  recommendation: string;
  /** What improves once the dealer acts on this rule. */
  expected_outcome: string;
}

/**
 * Master rule registry. Order is stable so PDF rendering is deterministic.
 * Add new rules at the bottom — do not reorder existing entries.
 */
export const WEBSITE_AUDIT_RULES: WebsiteAuditRule[] = [
  /* -------------------------------------------------------------- */
  /*  Mobile                                                         */
  /* -------------------------------------------------------------- */
  {
    slug: "mobile.viewport_meta_missing",
    title: "Missing mobile viewport meta",
    severity: "critical",
    category: "mobile",
    check: ({ scan }) => scan.homepage.viewport_meta_present === false,
    recommendation:
      "Your site is not set up for mobile devices. 60-70% of dealer site traffic comes from a phone. Add a viewport meta tag so the layout adapts to small screens.",
    expected_outcome:
      "Mobile customers see a layout sized for their phone instead of pinching and zooming. Bounce rate drops materially on mobile sessions.",
  },
  {
    slug: "mobile.horizontal_scroll",
    title: "Horizontal scroll on mobile",
    severity: "high",
    category: "mobile",
    check: ({ scan }) => scan.homepage.mobile_has_horizontal_scroll === true,
    recommendation:
      "Your homepage scrolls sideways on a phone. Customers read that as a broken site and leave. Fix the layout so everything fits within the screen width on mobile.",
    expected_outcome:
      "Mobile time-on-site increases. Customers reach your inventory grid instead of leaving from the homepage.",
  },
  {
    slug: "mobile.tap_target_too_small",
    title: "Tap targets too small on mobile",
    severity: "medium",
    category: "mobile",
    check: ({ scan }) =>
      scan.homepage.small_tap_targets_count !== undefined &&
      scan.homepage.small_tap_targets_count > 5,
    recommendation:
      "Several buttons and links on your homepage are too small to tap reliably on a phone. Buttons should be at least 44 by 44 pixels. Resize them.",
    expected_outcome:
      "Fewer mistaps. More customers reach the contact form or inventory page on the first try.",
  },

  /* -------------------------------------------------------------- */
  /*  Performance                                                    */
  /* -------------------------------------------------------------- */
  {
    slug: "perf.lcp_too_slow",
    title: "Slow page load (LCP > 4s)",
    severity: "high",
    category: "perf",
    check: ({ lighthouse }) =>
      lighthouse.available === true &&
      typeof lighthouse.lcp_seconds === "number" &&
      lighthouse.lcp_seconds > 4,
    recommendation:
      "Your VDP loads slowly. Customers walked away from your front-row vehicle before they could read the price sticker. Compress your photos and load them lazily.",
    expected_outcome:
      "VDPs load in under three seconds. Inventory page-views per session rise.",
  },
  {
    slug: "perf.large_payload",
    title: "Page payload over 3 MB",
    severity: "medium",
    category: "perf",
    check: ({ scan }) =>
      scan.network.total_bytes !== undefined &&
      scan.network.total_bytes > 3_000_000,
    recommendation:
      "Your homepage downloads over 3 MB before it shows anything useful. Customers on slow connections will leave. Audit your largest images and remove auto-playing video.",
    expected_outcome:
      "Mobile-data customers reach your inventory page without burning a quarter of their plan.",
  },
  {
    slug: "perf.too_many_requests",
    title: "Excessive network requests",
    severity: "medium",
    category: "perf",
    check: ({ scan }) =>
      scan.network.request_count !== undefined &&
      scan.network.request_count > 150,
    recommendation:
      "Your homepage fires more than 150 network requests. Each request adds delay. Remove unused tracking pixels and consolidate scripts.",
    expected_outcome:
      "Faster perceived load time. Fewer browser stalls when scrolling through inventory.",
  },
  {
    slug: "perf.no_lazy_loading",
    title: "Photos not lazy-loaded",
    severity: "medium",
    category: "perf",
    check: ({ scan }) => {
      const total = scan.vdp_samples.length;
      if (total === 0) return false;
      const without = scan.vdp_samples.filter((v) => v.photos_lazy_loaded === false).length;
      return without / total > 0.5;
    },
    recommendation:
      "Most of your VDP photos load all at once, even the ones below the fold. Add lazy-loading so the first photo shows immediately.",
    expected_outcome:
      "First photo shows in under a second on a phone. Customers scroll the carousel instead of leaving.",
  },
  {
    slug: "perf.lighthouse_perf_low",
    title: "Lighthouse performance score below 50",
    severity: "high",
    category: "perf",
    check: ({ lighthouse }) =>
      lighthouse.available === true &&
      typeof lighthouse.performance_score === "number" &&
      lighthouse.performance_score < 50,
    recommendation:
      "Independent performance scoring rates your site below 50 out of 100. That is the band where Google search rankings start to penalize you. Treat performance as a brand asset.",
    expected_outcome:
      "Search visibility recovers. Paid-search clicks convert more of the visitors you are already paying for.",
  },

  /* -------------------------------------------------------------- */
  /*  Inventory presentation (UX)                                    */
  /* -------------------------------------------------------------- */
  {
    slug: "ux.vdp_photo_count_low",
    title: "VDPs have fewer than 8 photos",
    severity: "high",
    category: "ux",
    check: ({ scan }) => {
      const samples = scan.vdp_samples;
      if (samples.length === 0) return false;
      const avg = samples.reduce((s, v) => s + (v.photo_count ?? 0), 0) / samples.length;
      return avg < 8;
    },
    recommendation:
      "Customers spend three times longer on VDPs with twelve or more photos. Your average VDP shows fewer than eight. Take more photos at every angle and add interior detail shots.",
    expected_outcome:
      "Time-on-VDP doubles. Lead form submissions per inventory view rise.",
  },
  {
    slug: "ux.missing_schema_markup",
    title: "Missing Vehicle schema markup",
    severity: "medium",
    category: "ux",
    check: ({ scan }) => {
      const samples = scan.vdp_samples;
      if (samples.length === 0) return false;
      const without = samples.filter((v) => v.has_vehicle_schema === false).length;
      return without / samples.length > 0.5;
    },
    recommendation:
      "Search engines don't understand your inventory. Add Vehicle schema markup so Google can show your VINs as rich results.",
    expected_outcome:
      "Inventory shows up in Google rich results with price + photo. Organic search clicks rise.",
  },
  {
    slug: "ux.no_alt_text",
    title: "Inventory photos missing alt text",
    severity: "low",
    category: "ux",
    check: ({ scan }) =>
      scan.homepage.image_alt_coverage !== undefined &&
      scan.homepage.image_alt_coverage < 0.8,
    recommendation:
      "Less than 80% of your photos have alt text. Search engines and screen readers cannot tell what is in them. Add a one-line description to every inventory photo.",
    expected_outcome:
      "Better SEO. Compliant with accessibility standards. Higher confidence with OEM compliance scoring.",
  },
  {
    slug: "ux.no_price_visible",
    title: "Price hidden behind 'call for price'",
    severity: "high",
    category: "conversion",
    check: ({ scan }) => {
      const samples = scan.vdp_samples;
      if (samples.length === 0) return false;
      const without = samples.filter((v) => v.price_visible === false).length;
      return without / samples.length > 0.3;
    },
    recommendation:
      "More than a third of your VDPs hide the price behind 'call for price'. Today's customers will not call. They will go to a competitor who shows the number.",
    expected_outcome:
      "More form submissions from intent-stage shoppers. Phone calls don't drop, because the high-intent caller still calls.",
  },

  /* -------------------------------------------------------------- */
  /*  Conversion                                                     */
  /* -------------------------------------------------------------- */
  {
    slug: "conversion.too_many_form_fields",
    title: "Lead form has too many fields",
    severity: "high",
    category: "conversion",
    check: ({ scan }) =>
      scan.homepage.primary_form_field_count !== undefined &&
      scan.homepage.primary_form_field_count > 11,
    recommendation:
      "Top-converting dealer sites use eleven or fewer fields in initial lead capture. Your form has more. Cut every field that isn't strictly required.",
    expected_outcome:
      "Form completion rate rises 20-40%. Lead volume grows without ad spend changing.",
  },
  {
    slug: "conversion.no_form_above_fold",
    title: "No lead form visible above the fold",
    severity: "medium",
    category: "conversion",
    check: ({ scan }) =>
      scan.homepage.has_above_fold_cta === false,
    recommendation:
      "Customers landing on your homepage do not see a way to contact you without scrolling. Put a clear call-to-action in the top section.",
    expected_outcome:
      "Faster path from landing to lead form. Higher conversion on paid-search landings.",
  },
  {
    slug: "conversion.no_inventory_search",
    title: "No inventory search visible on homepage",
    severity: "medium",
    category: "conversion",
    check: ({ scan }) => scan.homepage.has_inventory_link === false,
    recommendation:
      "Your homepage does not link to inventory in the top navigation. Customers are looking for cars. Make the inventory link the most visible thing on the page.",
    expected_outcome:
      "More homepage visitors reach a VDP. Higher cars-per-visitor ratio.",
  },
  {
    slug: "conversion.no_phone_number",
    title: "Phone number not visible on homepage",
    severity: "medium",
    category: "conversion",
    check: ({ scan }) => scan.homepage.phone_visible === false,
    recommendation:
      "Your homepage does not show a phone number above the fold. A material share of shoppers prefer to call, especially older buyers. Surface the number.",
    expected_outcome:
      "Phone-lead volume rises. Call-tracking attribution clarifies which campaigns drive calls.",
  },
  {
    slug: "conversion.no_trade_in_cta",
    title: "No trade-in valuation tool",
    severity: "low",
    category: "conversion",
    check: ({ scan }) => scan.homepage.has_trade_in_link === false,
    recommendation:
      "Customers shopping for a new vehicle want to know their trade value first. Surface a trade-in tool on the homepage.",
    expected_outcome:
      "Earlier-funnel lead capture. Trade-equity intelligence feeds into pre-sale conversations.",
  },
  {
    slug: "conversion.no_financing_link",
    title: "No financing or pre-qualification path",
    severity: "low",
    category: "conversion",
    check: ({ scan }) => scan.homepage.has_financing_link === false,
    recommendation:
      "Customers want to know what they qualify for before they walk in. Add a soft pre-qualification link.",
    expected_outcome:
      "Higher-quality leads. F&I has more lead time to structure deals.",
  },

  /* -------------------------------------------------------------- */
  /*  Brand                                                          */
  /* -------------------------------------------------------------- */
  {
    slug: "brand.missing_meta_description",
    title: "Missing meta description",
    severity: "low",
    category: "brand",
    check: ({ scan }) =>
      !scan.homepage.meta_description ||
      scan.homepage.meta_description.trim().length < 30,
    recommendation:
      "Your homepage has no useful meta description. That is the snippet Google shows under your name in search results. Write a one-sentence dealership pitch.",
    expected_outcome:
      "Higher click-through on Google search results. Better OEM-compliance scoring.",
  },
  {
    slug: "brand.weak_title",
    title: "Generic or thin page title",
    severity: "low",
    category: "brand",
    check: ({ scan }) =>
      !scan.homepage.title ||
      scan.homepage.title.trim().length < 15 ||
      /^untitled|^home$|^welcome$/i.test(scan.homepage.title.trim()),
    recommendation:
      "Your homepage title is generic or too short. The title is what appears in browser tabs and search rankings. Include dealership name, city, and main make.",
    expected_outcome:
      "Better organic ranking on geographic queries. Recognizable browser tabs for return shoppers.",
  },
  {
    slug: "brand.no_inventory_count",
    title: "Vehicle inventory count not surfaced",
    severity: "low",
    category: "brand",
    check: ({ scan }) => scan.homepage.shows_inventory_count === false,
    recommendation:
      "Your homepage does not advertise how much inventory you have. Customers shopping selection want to see a number like '210 used vehicles available now'.",
    expected_outcome:
      "Customers shopping selection click through instead of bouncing.",
  },

  /* -------------------------------------------------------------- */
  /*  Compliance                                                     */
  /* -------------------------------------------------------------- */
  {
    slug: "compliance.no_privacy_policy",
    title: "Privacy policy link missing",
    severity: "high",
    category: "compliance",
    check: ({ scan }) => scan.homepage.has_privacy_link === false,
    recommendation:
      "Your homepage does not link to a privacy policy. State and federal regulations require one. Add a footer link.",
    expected_outcome:
      "Compliant with CCPA, FTC, and OEM franchise standards.",
  },
  {
    slug: "compliance.no_tcpa_consent",
    title: "Lead form missing TCPA consent text",
    severity: "high",
    category: "compliance",
    check: ({ scan }) => scan.homepage.has_tcpa_consent === false,
    recommendation:
      "Your lead form does not show TCPA consent text. Calling or texting customers without explicit consent creates regulatory risk. Add a checkbox and the standard consent language.",
    expected_outcome:
      "Phone and SMS outreach are TCPA-compliant. Lower legal risk.",
  },
  {
    slug: "compliance.no_accessibility_statement",
    title: "Accessibility statement missing",
    severity: "low",
    category: "compliance",
    check: ({ scan }) => scan.homepage.has_accessibility_link === false,
    recommendation:
      "Your homepage does not link to an accessibility statement. ADA lawsuits target dealer sites without one. Publish a basic statement.",
    expected_outcome:
      "Reduced ADA litigation exposure.",
  },
  {
    slug: "compliance.lighthouse_accessibility_low",
    title: "Accessibility score below 70",
    severity: "medium",
    category: "compliance",
    check: ({ lighthouse }) =>
      lighthouse.available === true &&
      typeof lighthouse.accessibility_score === "number" &&
      lighthouse.accessibility_score < 70,
    recommendation:
      "Automated accessibility scoring rates your site below 70. Common fixes: better color contrast, larger tap targets, descriptive link text.",
    expected_outcome:
      "Better experience for shoppers with vision impairment. Lower ADA exposure.",
  },
  {
    slug: "compliance.no_ssl",
    title: "Site not served over HTTPS",
    severity: "critical",
    category: "compliance",
    check: ({ scan }) => scan.homepage.is_https === false,
    recommendation:
      "Your site does not use HTTPS. Browsers show a 'not secure' warning. Get an SSL certificate immediately.",
    expected_outcome:
      "Trust restored. Browsers no longer warn shoppers away.",
  },

  /* -------------------------------------------------------------- */
  /*  Additional UX                                                  */
  /* -------------------------------------------------------------- */
  {
    slug: "ux.no_video_walkaround",
    title: "No video walkaround on VDPs",
    severity: "low",
    category: "ux",
    check: ({ scan }) => {
      const samples = scan.vdp_samples;
      if (samples.length === 0) return false;
      const without = samples.filter((v) => v.has_video === false).length;
      return without / samples.length > 0.8;
    },
    recommendation:
      "Almost none of your VDPs carry a walkaround video. Buyers spend five times longer on VDPs with a video.",
    expected_outcome:
      "Customers feel they have already seen the car. Showroom conversions rise.",
  },
  {
    slug: "ux.no_carfax_link",
    title: "No vehicle history link on used VDPs",
    severity: "medium",
    category: "ux",
    check: ({ scan }) => {
      const samples = scan.vdp_samples;
      if (samples.length === 0) return false;
      const without = samples.filter((v) => v.has_history_link === false).length;
      return without / samples.length > 0.5;
    },
    recommendation:
      "Most of your used VDPs do not link to a vehicle history report. Buyers expect to see Carfax or AutoCheck before they consider a used car.",
    expected_outcome:
      "Used inventory closes faster. Lower negotiation friction at point of sale.",
  },
  {
    slug: "ux.no_third_party_reviews",
    title: "No third-party review surface",
    severity: "low",
    category: "brand",
    check: ({ scan }) => scan.homepage.has_review_widget === false,
    recommendation:
      "Your homepage does not surface third-party reviews. Customers trust independent reviews more than testimonials. Embed your Google or DealerRater rating.",
    expected_outcome:
      "Higher conversion on first-time shoppers. Reputation surface aligns with the store's actual review presence.",
  },
  {
    slug: "ux.broken_link_present",
    title: "Broken or 404 links detected",
    severity: "medium",
    category: "ux",
    check: ({ scan }) =>
      scan.homepage.broken_link_count !== undefined &&
      scan.homepage.broken_link_count > 0,
    recommendation:
      "We found at least one broken link on your homepage. Customers reading it as a sign the site is unmaintained.",
    expected_outcome:
      "Better trust. Better search ranking. No 'wait, is this dealership still open?' moments.",
  },
];

/** Number of rules — asserted by unit tests for regression catch. */
export const WEBSITE_AUDIT_RULE_COUNT = WEBSITE_AUDIT_RULES.length;

export interface TriggeredRule {
  rule: WebsiteAuditRule;
  /** Stable copy of the rule's slug for serialization. */
  slug: string;
  severity: RuleSeverity;
  category: RuleCategory;
}

/**
 * Run every rule against the findings. Returns the list of triggered rules
 * in severity order (critical > high > medium > low).
 */
export function applyRules(ctx: FindingsContext): TriggeredRule[] {
  const triggered: TriggeredRule[] = [];
  for (const rule of WEBSITE_AUDIT_RULES) {
    try {
      if (rule.check(ctx)) {
        triggered.push({
          rule,
          slug: rule.slug,
          severity: rule.severity,
          category: rule.category,
        });
      }
    } catch (err) {
      // Defensive — never let a buggy rule break the whole scan.
      console.error(`[website-audit] rule ${rule.slug} threw:`, err);
    }
  }
  const order: Record<RuleSeverity, number> = {
    critical: 0,
    high: 1,
    medium: 2,
    low: 3,
  };
  triggered.sort((a, b) => order[a.severity] - order[b.severity]);
  return triggered;
}

/**
 * Score a site 0-100. Naive but deterministic: start at 100, subtract per
 * triggered rule weighted by severity. Floor at 0.
 */
export function computeOverallScore(triggered: TriggeredRule[]): number {
  const weights: Record<RuleSeverity, number> = {
    critical: 20,
    high: 10,
    medium: 5,
    low: 2,
  };
  let score = 100;
  for (const t of triggered) {
    score -= weights[t.severity];
  }
  return Math.max(0, score);
}
