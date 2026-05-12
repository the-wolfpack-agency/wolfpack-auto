/**
 * Unit tests for intent-mapper/tokenizer.ts.
 *
 * Covers: stopword dropping, lemmatization, dealership-native short
 * tokens, digit preservation, edge cases (empty, undefined, special
 * chars).
 */

import { tokenize, tokenizeAction } from "../tokenizer";

describe("tokenize - basic behavior", () => {
  test("empty input returns empty array", () => {
    expect(tokenize("")).toEqual([]);
  });
  test("null/undefined-like inputs are safe", () => {
    expect(tokenize(undefined as unknown as string)).toEqual([]);
    expect(tokenize(null as unknown as string)).toEqual([]);
  });
  test("lowercases all output", () => {
    expect(tokenize("ROUTING")).toContain("routing");
  });
  test("strips punctuation", () => {
    expect(tokenize("update, lead, routing!")).toContain("update");
    expect(tokenize("update, lead, routing!")).toContain("routing");
  });
  test("preserves digits", () => {
    expect(tokenize("route 5 leads")).toContain("5");
  });
});

describe("tokenize - stopword behavior", () => {
  test("drops common stopwords (the, a, of, and)", () => {
    const out = tokenize("the dealer of the year and a half");
    expect(out).not.toContain("the");
    expect(out).not.toContain("of");
    expect(out).not.toContain("and");
    expect(out).not.toContain("a");
  });
  test("KEEPS 'my' (dealer-native intent marker)", () => {
    expect(tokenize("show my funnel")).toContain("my");
  });
  test("KEEPS 'set' (verb in 'set attach target')", () => {
    expect(tokenize("set attach target")).toContain("set");
  });
  test("KEEPS 'show' (verb in 'show funnel')", () => {
    expect(tokenize("show my funnel")).toContain("show");
  });
  test("KEEPS 'for' (preposition in 'route for maria')", () => {
    expect(tokenize("route leads for maria")).toContain("for");
  });
});

describe("tokenize - dealership short tokens", () => {
  test("preserves F&I after & is stripped", () => {
    const out = tokenize("F&I attach rate");
    expect(out).toContain("fi");
  });
  test("keeps 'fi' even though length < 3", () => {
    expect(tokenize("fi report")).toContain("fi");
  });
  test("keeps 'gm' (general manager)", () => {
    expect(tokenize("gm dashboard")).toContain("gm");
  });
});

describe("tokenize - lemmatization", () => {
  test("emits stem for -ing verbs", () => {
    const out = tokenize("running routing");
    expect(out).toContain("run");
    expect(out).toContain("running");
  });
  test("collapses -ed to base form", () => {
    expect(tokenize("updated routed")).toContain("update");
    expect(tokenize("updated routed")).toContain("route");
  });
  test("collapses -s plurals", () => {
    expect(tokenize("leads deals customers")).toContain("lead");
    expect(tokenize("leads deals customers")).toContain("deal");
    expect(tokenize("leads deals customers")).toContain("customer");
  });
  test("does not over-lemmatize -ss endings", () => {
    expect(tokenize("business class")).toContain("business");
  });
  test("handles -ied → -y (modified → modify)", () => {
    expect(tokenize("modified verified")).toContain("modify");
  });
});

describe("tokenize - deduplication", () => {
  test("output is deduplicated", () => {
    const out = tokenize("update update update");
    expect(out.filter((t) => t === "update")).toHaveLength(1);
  });
  test("lemma and original both retained but not duplicated", () => {
    const out = tokenize("routing routing");
    expect(out.filter((t) => t === "routing")).toHaveLength(1);
  });
});

describe("tokenize - 50+ realistic prompt corpus", () => {
  const prompts = [
    "show me leads from this week",
    "route the next 5 leads to maria",
    "what's my F&I attach rate looking like",
    "i need to update service hours for tomorrow",
    "draft an email to the customer who came in yesterday",
    "reorder the F&I menu so GAP is first",
    "set GAP attach target to 60%",
    "add a service closure for 2026-12-25",
    "feature this F-150 on the homepage",
    "drop the price on stock 12345 to $24,999",
    "stop notifying me after work hours",
    "alert me when leads slow down via sms",
    "view my conversion funnel for the past 30 days",
    "compare my numbers to top performers",
    "suggest training to improve my close rate",
    "what is gross PVR",
    "update my profile email to homyk@thewolfpack.agency",
    "change my phone number to 555-123-4567",
    "fix my display name in my profile",
    "switch lead routing to round robin",
    "set up balanced lead distribution",
    "change how leads get assigned to first available",
    "assign this lead to dave",
    "give this prospect to the next salesperson",
    "promote tire and wheel up the menu",
    "change service contract penetration target to 45 percent",
    "bump up the prepaid maintenance attach goal to 30%",
    "run an F&I penetration audit on last 30 days",
    "audit F&I performance over the past 90 days",
    "check F I product penetration",
    "update service hours for monday to 8am-6pm",
    "change saturday service hours to open at 9am and close at 3pm",
    "schedule a holiday closure for thanksgiving",
    "put the Tahoe in the homepage hero",
    "promote the silverado on the lot to top spot",
    "reprice the aged F-150 to $32500",
    "set new price on this vehicle to $19,750",
    "write a follow up message to my last test drive lead",
    "compose a service follow-up email for the customer",
    "don't ping me at night or on weekends",
    "mute notifications outside business hours",
    "subscribe me to aged inventory alerts in email",
    "pull my lead funnel numbers",
    "how are my leads converting",
    "how do my deals stack up against my peers",
    "benchmark my close rate against other reps",
    "what course would help me sell more GAP",
    "recommend coaching for my weakest metric",
    "explain the F&I attach rate metric to me",
    "define what days-to-sale means",
  ];

  test.each(prompts)("tokenizes '%s' deterministically (non-empty)", (p) => {
    const out = tokenize(p);
    expect(out.length).toBeGreaterThan(0);
    // determinism: run twice, identical output
    expect(tokenize(p)).toEqual(out);
  });
});

describe("tokenizeAction", () => {
  test("merges slug + display_name + description tokens", () => {
    const out = tokenizeAction({
      slug: "leads.update_routing_rule",
      display_name: "Update lead routing",
      description: "Change which sales rep gets which new leads.",
    });
    expect(out.has("lead")).toBe(true);
    expect(out.has("routing")).toBe(true);
    expect(out.has("update")).toBe(true);
    expect(out.has("rule")).toBe(true);
  });
});
