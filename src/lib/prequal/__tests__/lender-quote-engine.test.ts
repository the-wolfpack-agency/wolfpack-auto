/**
 * Unit tests for the lender quote engine -- pure, deterministic, no I/O.
 *
 * Covers:
 *   - All credit-tier branches (5)
 *   - Income-threshold gating
 *   - LTV gating (expensive vehicle on low income)
 *   - Lender appetite (super_prime only on captive-OEM)
 *   - Sort order (lowest APR first)
 *   - Offer expiry computation
 */

import {
  generateQuotes,
  DEFAULT_LENDERS,
  monthlyPaymentCents,
  tierMeetsMinimum,
} from "@/lib/prequal/lender-quote-engine";
import type {
  CreditResult,
  IncomeResult,
  VehicleInterest,
  CreditTier,
} from "@/lib/prequal/types";

function mkCredit(tier: CreditTier): CreditResult {
  return {
    bureauUsed: "mock",
    scoreRangeMin: 600,
    scoreRangeMax: 700,
    tier,
    rawResponse: "",
    isMock: true,
  };
}

function mkIncome(monthlyCents: number): IncomeResult {
  return {
    incomeMonthlyCents: monthlyCents,
    confidence: "self_reported",
    isMock: false,
  };
}

function mkVehicle(priceCents: number): VehicleInterest {
  return { text: "test vehicle", estimatedPriceCents: priceCents };
}

const NOW = new Date("2026-05-11T12:00:00Z");

describe("generateQuotes", () => {
  describe("credit tier branches", () => {
    it("super_prime customer gets every super_prime-tier lender", () => {
      const offers = generateQuotes({
        credit: mkCredit("super_prime"),
        income: mkIncome(800_000),
        vehicle: mkVehicle(4_000_000),
        now: NOW,
      });
      expect(offers.length).toBeGreaterThan(0);
      // captive-OEM should be included
      expect(offers.find((o) => o.lenderId === "captive-oem-finance")).toBeDefined();
      // prime-bank should be included
      expect(offers.find((o) => o.lenderId === "prime-bank")).toBeDefined();
      // wolfpack-financial should be included
      expect(offers.find((o) => o.lenderId === "wolfpack-financial")).toBeDefined();
    });

    it("prime customer gets prime-eligible lenders, not subprime-only", () => {
      const offers = generateQuotes({
        credit: mkCredit("prime"),
        income: mkIncome(700_000),
        vehicle: mkVehicle(3_500_000),
        now: NOW,
      });
      expect(offers.find((o) => o.lenderId === "prime-bank")).toBeDefined();
      expect(offers.find((o) => o.lenderId === "captive-oem-finance")).toBeDefined();
      // Should NOT include subprime-only lenders since prime-bank already covered
      // Second-chance-credit does not advertise prime in aprBpsByTier, so should be absent.
      expect(offers.find((o) => o.lenderId === "second-chance-credit")).toBeUndefined();
      expect(offers.find((o) => o.lenderId === "buy-here-pay-here")).toBeUndefined();
    });

    it("near_prime customer cannot get captive-OEM or prime-bank", () => {
      const offers = generateQuotes({
        credit: mkCredit("near_prime"),
        income: mkIncome(450_000),
        vehicle: mkVehicle(3_000_000),
        now: NOW,
      });
      expect(offers.find((o) => o.lenderId === "captive-oem-finance")).toBeUndefined();
      expect(offers.find((o) => o.lenderId === "prime-bank")).toBeUndefined();
      // wolfpack-financial DOES cover near_prime
      expect(offers.find((o) => o.lenderId === "wolfpack-financial")).toBeDefined();
      // second-chance covers near_prime
      expect(offers.find((o) => o.lenderId === "second-chance-credit")).toBeDefined();
    });

    it("subprime customer only sees subprime/deep_subprime lenders", () => {
      const offers = generateQuotes({
        credit: mkCredit("subprime"),
        income: mkIncome(300_000),
        vehicle: mkVehicle(2_500_000),
        now: NOW,
      });
      expect(offers.find((o) => o.lenderId === "captive-oem-finance")).toBeUndefined();
      expect(offers.find((o) => o.lenderId === "prime-bank")).toBeUndefined();
      expect(offers.find((o) => o.lenderId === "wolfpack-financial")).toBeUndefined();
      expect(offers.find((o) => o.lenderId === "second-chance-credit")).toBeDefined();
      expect(offers.find((o) => o.lenderId === "buy-here-pay-here")).toBeDefined();
    });

    it("deep_subprime customer only sees buy-here-pay-here", () => {
      const offers = generateQuotes({
        credit: mkCredit("deep_subprime"),
        income: mkIncome(200_000),
        vehicle: mkVehicle(1_800_000),
        now: NOW,
      });
      expect(offers).toHaveLength(1);
      expect(offers[0].lenderId).toBe("buy-here-pay-here");
    });
  });

  describe("income thresholds", () => {
    it("rejects every lender when income is below the deep-subprime minimum", () => {
      const offers = generateQuotes({
        credit: mkCredit("deep_subprime"),
        income: mkIncome(100_000), // below 150,000 buy-here-pay-here minimum
        vehicle: mkVehicle(1_500_000),
        now: NOW,
      });
      expect(offers).toHaveLength(0);
    });

    it("prime-bank requires >= 300k monthly income", () => {
      const offers = generateQuotes({
        credit: mkCredit("prime"),
        income: mkIncome(280_000),
        vehicle: mkVehicle(3_000_000),
        now: NOW,
      });
      expect(offers.find((o) => o.lenderId === "prime-bank")).toBeUndefined();
    });

    it("captive-OEM requires >= 350k monthly income", () => {
      const offers = generateQuotes({
        credit: mkCredit("super_prime"),
        income: mkIncome(340_000),
        vehicle: mkVehicle(3_000_000),
        now: NOW,
      });
      expect(offers.find((o) => o.lenderId === "captive-oem-finance")).toBeUndefined();
    });
  });

  describe("LTV gating + PTI cap", () => {
    it("limits principal so monthly payment stays at or below 20% of income", () => {
      const offers = generateQuotes({
        credit: mkCredit("prime"),
        income: mkIncome(500_000), // $5k/mo -> $1k/mo PTI ceiling
        vehicle: mkVehicle(9_000_000), // expensive
        now: NOW,
      });
      for (const o of offers) {
        expect(o.estimatedMonthlyPaymentCents).toBeLessThanOrEqual(
          Math.ceil(500_000 * 0.2) + 5, // +5 for ceil rounding tolerance
        );
      }
    });

    it("caps principal at lender max-loan-amount", () => {
      const offers = generateQuotes({
        credit: mkCredit("super_prime"),
        income: mkIncome(20_000_000),
        vehicle: mkVehicle(20_000_000),
        now: NOW,
      });
      const captive = offers.find((o) => o.lenderId === "captive-oem-finance");
      // captive max is 10_000_000
      expect(captive?.maxAmountCents).toBeLessThanOrEqual(10_000_000);
    });

    it("caps principal at max-LTV against the vehicle price", () => {
      // prime-bank max LTV is 115%
      const offers = generateQuotes({
        credit: mkCredit("prime"),
        income: mkIncome(2_000_000),
        vehicle: mkVehicle(4_000_000),
        now: NOW,
      });
      const primeBank = offers.find((o) => o.lenderId === "prime-bank");
      // LTV ceiling = 4_000_000 * 1.15 = 4_600_000
      expect(primeBank?.maxAmountCents).toBeLessThanOrEqual(4_600_000);
    });
  });

  describe("sort + metadata", () => {
    it("sorts offers by APR ascending", () => {
      const offers = generateQuotes({
        credit: mkCredit("super_prime"),
        income: mkIncome(900_000),
        vehicle: mkVehicle(4_500_000),
        now: NOW,
      });
      for (let i = 1; i < offers.length; i++) {
        expect(offers[i].aprBps).toBeGreaterThanOrEqual(offers[i - 1].aprBps);
      }
    });

    it("stamps mock indicators on conditions metadata", () => {
      const offers = generateQuotes({
        credit: mkCredit("prime"),
        income: mkIncome(700_000),
        vehicle: mkVehicle(3_500_000),
        now: NOW,
      });
      for (const o of offers) {
        expect(o.conditions.credit_is_mock).toBe(true);
        expect(o.conditions.income_is_mock).toBe(false);
        expect(o.conditions.bureau_used).toBe("mock");
        expect(o.conditions.income_confidence).toBe("self_reported");
      }
    });

    it("sets expiresAt 14 days into the future", () => {
      const offers = generateQuotes({
        credit: mkCredit("prime"),
        income: mkIncome(700_000),
        vehicle: mkVehicle(3_500_000),
        now: NOW,
      });
      for (const o of offers) {
        const expectedMs = NOW.getTime() + 14 * 24 * 60 * 60 * 1000;
        expect(new Date(o.expiresAt).getTime()).toBe(expectedMs);
      }
    });
  });

  describe("monthlyPaymentCents helper", () => {
    it("matches the standard amortization formula", () => {
      // $30,000 at 6% APR for 60 months = $579.98/mo (approximately)
      const pmt = monthlyPaymentCents(3_000_000, 600, 60);
      expect(pmt).toBeGreaterThan(57_900);
      expect(pmt).toBeLessThan(58_100);
    });

    it("handles 0% APR by simple division", () => {
      expect(monthlyPaymentCents(1_200_000, 0, 12)).toBe(100_000);
    });
  });

  describe("tierMeetsMinimum", () => {
    it("returns true when applicant is at or above lender minimum", () => {
      expect(tierMeetsMinimum("super_prime", "prime")).toBe(true);
      expect(tierMeetsMinimum("prime", "prime")).toBe(true);
      expect(tierMeetsMinimum("near_prime", "prime")).toBe(false);
    });
  });

  describe("default lenders sanity", () => {
    it("ships exactly 5 default lenders", () => {
      expect(DEFAULT_LENDERS).toHaveLength(5);
    });

    it("every lender has APR for at least one tier it claims to cover", () => {
      for (const rule of DEFAULT_LENDERS) {
        const aprs = Object.values(rule.aprBpsByTier);
        expect(aprs.length).toBeGreaterThan(0);
        for (const apr of aprs) {
          expect(apr).toBeGreaterThan(0);
        }
      }
    });
  });
});
