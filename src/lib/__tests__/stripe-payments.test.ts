/**
 * Unit Tests — Stripe Payment Integration
 *
 * Tests fee calculation, reconciliation, provider status,
 * and shadow mode mock responses.
 */

import {
  calculateFees,
  buildReconciliation,
  isStripeConfigured,
  getStripeStatus,
  type PaymentType,
} from "@/lib/stripe-payments";

describe("Stripe Payment Integration", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe("Fee Calculation", () => {
    test("calculates platform and stripe fees", () => {
      const fees = calculateFees(10000); // $100.00
      expect(fees.amount).toBe(10000);
      expect(fees.platform_fee).toBeGreaterThan(0);
      expect(fees.stripe_fee).toBeGreaterThan(0);
      expect(fees.net_to_dealer).toBeLessThan(fees.amount);
    });

    test("platform fee at default 2.9%", () => {
      const fees = calculateFees(10000);
      expect(fees.platform_fee).toBe(290); // 2.9% of $100
    });

    test("custom platform fee percentage", () => {
      const fees = calculateFees(10000, 1.5);
      expect(fees.platform_fee).toBe(150); // 1.5% of $100
    });

    test("stripe fee includes fixed component", () => {
      const fees = calculateFees(10000);
      // 2.9% + $0.30 = 290 + 30 = 320 cents
      expect(fees.stripe_fee).toBe(320);
    });

    test("net to dealer = amount - platform - stripe", () => {
      const fees = calculateFees(10000);
      expect(fees.net_to_dealer).toBe(fees.amount - fees.platform_fee - fees.stripe_fee);
    });

    test("handles small amounts", () => {
      const fees = calculateFees(100); // $1.00
      expect(fees.platform_fee).toBeGreaterThanOrEqual(0);
      expect(fees.net_to_dealer).toBeLessThan(100);
    });

    test("handles large amounts", () => {
      const fees = calculateFees(5000000); // $50,000
      expect(fees.platform_fee).toBe(145000); // 2.9% of $50K
      expect(fees.net_to_dealer).toBeGreaterThan(0);
    });
  });

  describe("Reconciliation", () => {
    test("builds daily summary from transactions", () => {
      const recon = buildReconciliation([
        { amount: 35000_00, status: "succeeded", payment_type: "deal" as PaymentType, payment_method: "card", platform_fee: 1015_00, stripe_fee: 1015_30 },
        { amount: 250_00, status: "succeeded", payment_type: "service" as PaymentType, payment_method: "terminal", platform_fee: 7_25, stripe_fee: 7_55 },
        { amount: 100_00, status: "failed", payment_type: "parts" as PaymentType, payment_method: "card", platform_fee: 0, stripe_fee: 0 },
      ], "2026-04-02");

      expect(recon.date).toBe("2026-04-02");
      expect(recon.total_transactions).toBe(2); // only succeeded
      expect(recon.total_collected).toBeGreaterThan(0);
      expect(recon.total_fees).toBeGreaterThan(0);
      expect(recon.net_amount).toBeGreaterThan(0);
    });

    test("groups by payment type", () => {
      const recon = buildReconciliation([
        { amount: 1000, status: "succeeded", payment_type: "deal" as PaymentType, payment_method: "card", platform_fee: 29, stripe_fee: 59 },
        { amount: 500, status: "succeeded", payment_type: "deal" as PaymentType, payment_method: "card", platform_fee: 15, stripe_fee: 45 },
        { amount: 200, status: "succeeded", payment_type: "service" as PaymentType, payment_method: "terminal", platform_fee: 6, stripe_fee: 36 },
      ], "2026-04-02");

      expect(recon.by_type["deal"].count).toBe(2);
      expect(recon.by_type["service"].count).toBe(1);
    });

    test("groups by payment method", () => {
      const recon = buildReconciliation([
        { amount: 1000, status: "succeeded", payment_type: "deal" as PaymentType, payment_method: "card", platform_fee: 29, stripe_fee: 59 },
        { amount: 500, status: "succeeded", payment_type: "service" as PaymentType, payment_method: "terminal", platform_fee: 15, stripe_fee: 45 },
      ], "2026-04-02");

      expect(recon.by_method["card"].count).toBe(1);
      expect(recon.by_method["terminal"].count).toBe(1);
    });

    test("handles refunds", () => {
      const recon = buildReconciliation([
        { amount: 1000, status: "refunded", payment_type: "deal" as PaymentType, payment_method: "card", platform_fee: 29, stripe_fee: 59, refund_amount: 1000 },
      ], "2026-04-02");

      expect(recon.total_refunded).toBe(1000);
    });

    test("handles empty transactions", () => {
      const recon = buildReconciliation([], "2026-04-02");
      expect(recon.total_transactions).toBe(0);
      expect(recon.total_collected).toBe(0);
      expect(recon.net_amount).toBe(0);
    });
  });

  describe("Provider Status", () => {
    test("reports not configured when no key", () => {
      delete process.env.STRIPE_SECRET_KEY;
      expect(isStripeConfigured()).toBe(false);
      expect(getStripeStatus().mode).toBe("none");
    });

    test("detects test mode", () => {
      process.env.STRIPE_SECRET_KEY = "sk_test_abc123";
      expect(isStripeConfigured()).toBe(true);
      expect(getStripeStatus().mode).toBe("test");
    });

    test("detects live mode", () => {
      process.env.STRIPE_SECRET_KEY = "sk_live_abc123";
      expect(isStripeConfigured()).toBe(true);
      expect(getStripeStatus().mode).toBe("live");
    });
  });
});
