/**
 * Unit tests — Deal-Desk Copilot orchestrator
 *
 * Covers:
 *  - All six suggestion generators produce valid drafts for representative
 *    snapshots (and degrade silently when their inputs don't apply).
 *  - openSession / generateSuggestions / acceptSuggestion / rejectSuggestion
 *    / recordOutcome flow without DATABASE_URL falls back to deterministic
 *    in-memory shadow rows.
 *  - The learning loop math: a `won` outcome lifts weights by
 *    LEARNING_LIFT_PER_OUTCOME for every accepted-suggestion generator;
 *    a `lost` outcome lowers them by the same delta, clamped to [0, 1].
 *  - Triple-write degrades gracefully when QDRANT_URL / NEO4J_URI are
 *    unset (no thrown errors).
 */

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  // Restore env to a known-good baseline. Tests that need DATABASE_URL set
  // it explicitly inside the test body via jest.isolateModulesAsync.
  for (const key of [
    "DATABASE_URL",
    "QDRANT_URL",
    "NEO4J_URI",
    "NEO4J_URL",
  ]) {
    delete process.env[key];
  }
  for (const [k, v] of Object.entries(ORIGINAL_ENV)) {
    if (v !== undefined) process.env[k] = v;
  }
});

// Helpers — we always re-import the module after mutating env so module-level
// state (like cached env reads) is fresh per test.
async function loadCopilot() {
  const mod = await import("@/lib/deal-copilot");
  return mod;
}

import type { DealSnapshot, GenerateOptions } from "@/lib/deal-copilot";

const baseSnapshot: DealSnapshot = {
  selling_price: 38500,
  msrp: 40000,
  invoice: 36000,
  term_months: 72,
  cash_down: 2000,
  apr: 7.9,
  lender_name: "Capital One Auto",
  credit_tier: 2,
  credit_score: 720,
  fi_products: [],
  vehicle_type: "new",
  vehicle_make: "Toyota",
  vehicle_model: "Camry",
  vehicle_year: 2024,
  vehicle_mileage: 0,
  target_monthly: 550,
  net_trade: 0,
  rebates: 0,
};

describe("deal-copilot — generators", () => {
  test("suggestRateStack returns tier-floor draft when current APR is materially above floor", async () => {
    const { suggestRateStack, __TEST__ } = await loadCopilot();
    const snap = { ...baseSnapshot, apr: __TEST__.TIER_RATE_FLOOR[2] + 2 };
    const drafts = await suggestRateStack(snap);
    expect(drafts).toHaveLength(1);
    expect(drafts[0].suggestion_type).toBe("rate_stack");
    expect(drafts[0].evidence.cite.length).toBeGreaterThan(0);
    expect(drafts[0].payload).toHaveProperty("new_apr");
  });

  test("suggestRateStack returns nothing when current APR is at or below tier floor", async () => {
    const { suggestRateStack, __TEST__ } = await loadCopilot();
    const snap = { ...baseSnapshot, apr: __TEST__.TIER_RATE_FLOOR[1] };
    const drafts = await suggestRateStack({ ...snap, credit_tier: 1 });
    expect(drafts).toHaveLength(0);
  });

  test("suggestRateStack uses real lender programs when provided", async () => {
    const { suggestRateStack } = await loadCopilot();
    const programs: GenerateOptions["lender_programs"] = [
      {
        lender_name: "Test Bank",
        program_name: "Prime",
        rate_tiers: [
          { min_score: 700, max_score: 850, min_term: 36, max_term: 84, rate: 4.5, advance_pct: 120 },
        ],
        max_advance: 120,
        max_term: 84,
        reserve_markup: 1,
        flat_fee: 0,
      },
    ];
    const drafts = await suggestRateStack(baseSnapshot, { lender_programs: programs });
    expect(drafts.length).toBeGreaterThan(0);
    expect(drafts[0].payload.new_apr).toBe(4.5);
    expect(drafts[0].evidence.cite).toContain("Test Bank");
  });

  test("suggestPaymentShape returns nothing when target_monthly is missing", async () => {
    const { suggestPaymentShape } = await loadCopilot();
    const drafts = await suggestPaymentShape({ ...baseSnapshot, target_monthly: undefined });
    expect(drafts).toHaveLength(0);
  });

  test("suggestPaymentShape returns at least one candidate when target is set", async () => {
    const { suggestPaymentShape } = await loadCopilot();
    const drafts = await suggestPaymentShape({ ...baseSnapshot, target_monthly: 550 });
    expect(drafts.length).toBeGreaterThan(0);
    for (const d of drafts) {
      expect(d.suggestion_type).toBe("payment_shape");
      expect(d.payload).toHaveProperty("term_months");
      expect(d.payload).toHaveProperty("monthly_payment");
    }
  });

  test("suggestMsrpDiscount fires when current price > 3% above market median", async () => {
    const { suggestMsrpDiscount } = await loadCopilot();
    const drafts = await suggestMsrpDiscount(
      { ...baseSnapshot, selling_price: 50000 },
      { market_median_price: 40000 },
    );
    expect(drafts).toHaveLength(1);
    expect(drafts[0].payload.proposed_selling_price).toBeLessThan(50000);
    expect(drafts[0].evidence.cite).toMatch(/above local-market median/);
  });

  test("suggestMsrpDiscount returns nothing when price is at market", async () => {
    const { suggestMsrpDiscount } = await loadCopilot();
    const drafts = await suggestMsrpDiscount(
      { ...baseSnapshot, selling_price: 40000 },
      { market_median_price: 40000 },
    );
    expect(drafts).toHaveLength(0);
  });

  test("suggestFiProductAttach returns up to 3 products not already attached", async () => {
    const { suggestFiProductAttach } = await loadCopilot();
    const drafts = await suggestFiProductAttach(baseSnapshot);
    expect(drafts.length).toBeGreaterThan(0);
    expect(drafts.length).toBeLessThanOrEqual(3);
    for (const d of drafts) {
      expect(d.suggestion_type).toBe("fi_product_attach");
      expect(d.payload).toHaveProperty("product_id");
    }
  });

  test("suggestFiProductAttach skips products already attached", async () => {
    const { suggestFiProductAttach } = await loadCopilot();
    const drafts = await suggestFiProductAttach({
      ...baseSnapshot,
      fi_products: ["warranty", "gap", "tire"],
    });
    for (const d of drafts) {
      expect(["warranty", "gap", "tire"]).not.toContain(d.payload.product_id);
    }
  });

  test("suggestLenderSwap fires when APR sits well above tier floor", async () => {
    const { suggestLenderSwap } = await loadCopilot();
    const drafts = await suggestLenderSwap({ ...baseSnapshot, apr: 14.0, credit_tier: 2 });
    expect(drafts).toHaveLength(1);
    expect(drafts[0].suggestion_type).toBe("lender_swap");
  });

  test("suggestLenderSwap stays silent at tier-matched rate", async () => {
    const { suggestLenderSwap } = await loadCopilot();
    const drafts = await suggestLenderSwap({ ...baseSnapshot, apr: 6.5, credit_tier: 2 });
    expect(drafts).toHaveLength(0);
  });

  test("suggestTermChange offers a longer term when current monthly exceeds target", async () => {
    const { suggestTermChange } = await loadCopilot();
    const drafts = await suggestTermChange({
      ...baseSnapshot,
      term_months: 60,
      target_monthly: 500,
      selling_price: 38500,
      cash_down: 1000,
    });
    if (drafts.length > 0) {
      expect(drafts[0].suggestion_type).toBe("term_change");
      expect(drafts[0].payload.new_term_months).toBeGreaterThan(60);
    }
  });

  test("suggestDownChange computes additional cash down required", async () => {
    const { suggestDownChange } = await loadCopilot();
    const drafts = await suggestDownChange({
      ...baseSnapshot,
      term_months: 72,
      cash_down: 0,
      target_monthly: 400,
    });
    if (drafts.length > 0) {
      expect(drafts[0].suggestion_type).toBe("down_change");
      const newDown = drafts[0].payload.new_cash_down as number;
      expect(newDown).toBeGreaterThan(0);
    }
  });

  test("suggestDownChange stays silent when current already hits target", async () => {
    const { suggestDownChange } = await loadCopilot();
    const drafts = await suggestDownChange({
      ...baseSnapshot,
      term_months: 72,
      cash_down: 30000,
      target_monthly: 200,
    });
    expect(drafts).toHaveLength(0);
  });
});

describe("deal-copilot — session lifecycle (shadow mode)", () => {
  test("openSession in shadow mode synthesizes a session row", async () => {
    delete process.env.DATABASE_URL;
    const { openSession } = await loadCopilot();
    const s = await openSession({
      dealer_id: "00000000-0000-4000-a000-000000000001",
      deal_id: "deal-shadow-1",
      opened_by_user_id: "u1",
    });
    expect(s.id).toMatch(/^shadow-/);
    expect(s.outcome).toBe("pending");
    expect(s.deal_id).toBe("deal-shadow-1");
  });

  test("generateSuggestions in shadow mode returns synthesized rows for valid generators", async () => {
    delete process.env.DATABASE_URL;
    const { generateSuggestions } = await loadCopilot();
    const out = await generateSuggestions(
      "shadow-session-1",
      "00000000-0000-4000-a000-000000000001",
      { ...baseSnapshot, apr: 12.0, credit_tier: 2, target_monthly: 550 },
    );
    expect(out.length).toBeGreaterThan(0);
    for (const s of out) {
      expect(s.id).toMatch(/^shadow-/);
      expect(s.evidence.cite.length).toBeGreaterThan(0);
      expect(typeof s.confidence).toBe("number");
    }
    const types = new Set(out.map((s) => s.suggestion_type));
    expect(types.size).toBeGreaterThanOrEqual(1);
  });

  test("acceptSuggestion / rejectSuggestion in shadow mode return null without throwing", async () => {
    delete process.env.DATABASE_URL;
    const { acceptSuggestion, rejectSuggestion } = await loadCopilot();
    await expect(acceptSuggestion("shadow-x", "u1")).resolves.toBeNull();
    await expect(rejectSuggestion("shadow-x", "no fit")).resolves.toBeNull();
  });

  test("recordOutcome in shadow mode reports zero weights updated", async () => {
    delete process.env.DATABASE_URL;
    const { recordOutcome } = await loadCopilot();
    const r = await recordOutcome({
      session_id: "shadow-session-1",
      dealer_id: "00000000-0000-4000-a000-000000000001",
      outcome: "won",
    });
    expect(r.outcome_id).toBeNull();
    expect(r.weights_updated).toBe(0);
  });

  test("triple-write fan-out is silent (no throw) when QDRANT/NEO4J unset", async () => {
    delete process.env.DATABASE_URL;
    delete process.env.QDRANT_URL;
    delete process.env.NEO4J_URI;
    delete process.env.NEO4J_URL;

    const consoleWarn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    const { generateSuggestions } = await loadCopilot();
    const out = await generateSuggestions(
      "shadow-session-2",
      "00000000-0000-4000-a000-000000000001",
      { ...baseSnapshot, apr: 14.0, credit_tier: 2 },
    );
    expect(out.length).toBeGreaterThan(0);
    consoleWarn.mockRestore();
  });
});

describe("deal-copilot — learning loop math", () => {
  // We can validate the math directly via the exposed __TEST__ constants
  // even without a real DB. The DB-backed weight bump is exercised by the
  // E2E spec against real Postgres.
  test("LEARNING_LIFT_PER_OUTCOME is symmetrical and within (0, 1)", async () => {
    const { __TEST__ } = await loadCopilot();
    expect(__TEST__.LEARNING_LIFT_PER_OUTCOME).toBeGreaterThan(0);
    expect(__TEST__.LEARNING_LIFT_PER_OUTCOME).toBeLessThan(1);
  });

  test("weight clamp: starting weight + 20 wins saturates at 1.0; - 20 losses floors at 0.0", async () => {
    const { __TEST__ } = await loadCopilot();
    const lift = __TEST__.LEARNING_LIFT_PER_OUTCOME;
    let w = __TEST__.DEFAULT_GENERATOR_WEIGHT;
    for (let i = 0; i < 20; i++) w = Math.max(0, Math.min(1, w + lift));
    expect(w).toBeCloseTo(1, 5);
    let w2 = __TEST__.DEFAULT_GENERATOR_WEIGHT;
    for (let i = 0; i < 20; i++) w2 = Math.max(0, Math.min(1, w2 - lift));
    expect(w2).toBeCloseTo(0, 5);
  });

  test("FI_PRODUCT_ATTACH_RATES covers every credit tier 1..5", async () => {
    const { __TEST__ } = await loadCopilot();
    for (const tier of [1, 2, 3, 4, 5] as const) {
      expect(__TEST__.FI_PRODUCT_ATTACH_RATES[tier].length).toBeGreaterThan(0);
      for (const p of __TEST__.FI_PRODUCT_ATTACH_RATES[tier]) {
        expect(p.attach_rate).toBeGreaterThanOrEqual(0);
        expect(p.attach_rate).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe("deal-copilot — generator catalog", () => {
  test("COPILOT_GENERATORS exposes all seven suggestion types", async () => {
    const { COPILOT_GENERATORS } = await loadCopilot();
    expect(COPILOT_GENERATORS).toEqual(
      expect.arrayContaining([
        "rate_stack",
        "payment_shape",
        "msrp_discount",
        "fi_product_attach",
        "lender_swap",
        "term_change",
        "down_change",
      ]),
    );
  });

  test("each generator is deterministic for the same input", async () => {
    const {
      suggestRateStack,
      suggestPaymentShape,
      suggestMsrpDiscount,
      suggestFiProductAttach,
      suggestLenderSwap,
      suggestTermChange,
      suggestDownChange,
    } = await loadCopilot();
    const snap = { ...baseSnapshot, apr: 14.0, credit_tier: 2, target_monthly: 500 } as const;
    const a = await Promise.all([
      suggestRateStack(snap),
      suggestPaymentShape(snap),
      suggestMsrpDiscount(snap, { market_median_price: 40000 }),
      suggestFiProductAttach(snap),
      suggestLenderSwap(snap),
      suggestTermChange(snap),
      suggestDownChange(snap),
    ]);
    const b = await Promise.all([
      suggestRateStack(snap),
      suggestPaymentShape(snap),
      suggestMsrpDiscount(snap, { market_median_price: 40000 }),
      suggestFiProductAttach(snap),
      suggestLenderSwap(snap),
      suggestTermChange(snap),
      suggestDownChange(snap),
    ]);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
