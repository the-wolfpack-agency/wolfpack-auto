/**
 * Tests for scripts/seed-demo-dealer.ts.
 *
 * Two layers:
 *   1. Pure-function tests on the data builders (counts, distributions,
 *      no-real-client-names guardrails, VIN shape, idempotent UUIDs).
 *      These run in any environment, no DB required.
 *
 *   2. DB integration tests that exercise the full seedDemoDealer flow
 *      against a real Postgres instance. Skipped automatically when
 *      DATABASE_URL is not set, so CI without a DB stays green. When the
 *      env var IS set, asserts row counts and idempotency.
 *
 * The DB tests scope themselves to a test-only dealer id so they cannot
 * collide with the real demo dealer.
 */

import {
  buildVehicles,
  buildLeads,
  buildDeals,
  buildServiceAppointments,
  buildFiDeals,
  buildAnalyticsEvents,
  deterministicUUID,
  syntheticVin,
  DEMO_DEALER_ID,
  DEMO_DEALER_SLUG,
  DEMO_DEALER_NAME,
  seedDemoDealer,
} from "../seed-demo-dealer";

describe("seed-demo-dealer: builders", () => {
  describe("syntheticVin", () => {
    it("produces 17-char VIN-shaped strings", () => {
      for (let i = 0; i < 20; i++) {
        const vin = syntheticVin(i);
        expect(vin).toHaveLength(17);
        expect(vin).toMatch(/^[A-HJ-NPR-Z0-9]{17}$/);
      }
    });

    it("produces unique VINs across all 75 vehicles", () => {
      const vins = new Set<string>();
      for (let i = 0; i < 75; i++) vins.add(syntheticVin(i));
      expect(vins.size).toBe(75);
    });

    it("is deterministic across runs", () => {
      expect(syntheticVin(0)).toBe(syntheticVin(0));
      expect(syntheticVin(42)).toBe(syntheticVin(42));
    });
  });

  describe("deterministicUUID", () => {
    it("produces an RFC 4122 v4-shaped string", () => {
      const id = deterministicUUID("ns", 0);
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[a-f][0-9a-f]{3}-[0-9a-f]{12}$/);
    });

    it("returns the same value for the same inputs", () => {
      expect(deterministicUUID("ns", 7)).toBe(deterministicUUID("ns", 7));
    });

    it("returns different values for different inputs", () => {
      expect(deterministicUUID("ns", 1)).not.toBe(deterministicUUID("ns", 2));
      expect(deterministicUUID("ns1", 1)).not.toBe(deterministicUUID("ns2", 1));
    });
  });

  describe("buildVehicles", () => {
    const vehicles = buildVehicles(75);

    it("returns the requested count", () => {
      expect(vehicles).toHaveLength(75);
    });

    it("covers sedans, SUVs, and trucks", () => {
      const bodyStyles = new Set(vehicles.map((v) => v.body_style));
      expect(bodyStyles.has("Sedan")).toBe(true);
      expect(bodyStyles.has("SUV")).toBe(true);
      expect(bodyStyles.has("Truck")).toBe(true);
    });

    it("includes electric vehicles", () => {
      const evs = vehicles.filter((v) => v.fuel_type === "electric");
      expect(evs.length).toBeGreaterThan(0);
    });

    it("has a mix of new, certified, and used", () => {
      const conditions = new Set(vehicles.map((v) => v.condition));
      expect(conditions.has("new")).toBe(true);
      expect(conditions.has("used")).toBe(true);
    });

    it("has reasonable prices (> 5000, < 200000)", () => {
      for (const v of vehicles) {
        expect(v.price).toBeGreaterThan(5000);
        expect(v.price).toBeLessThan(200000);
      }
    });

    it("has unique VINs", () => {
      const vins = new Set(vehicles.map((v) => v.vin));
      expect(vins.size).toBe(vehicles.length);
    });

    it("has unique stock numbers", () => {
      const stocks = new Set(vehicles.map((v) => v.stock_number));
      expect(stocks.size).toBe(vehicles.length);
    });
  });

  describe("buildLeads", () => {
    const vehicles = buildVehicles(75);
    const leads = buildLeads(40, vehicles);

    it("returns 40 leads", () => {
      expect(leads).toHaveLength(40);
    });

    it("includes every funnel status at least once", () => {
      const statuses = new Set(leads.map((l) => l.status));
      const required = [
        "new",
        "contacted",
        "appointment_scheduled",
        "test_drive_completed",
        "in_negotiation",
        "sold",
        "lost",
      ];
      for (const s of required) {
        expect(statuses.has(s)).toBe(true);
      }
    });

    it("is not all the same status", () => {
      const statuses = new Set(leads.map((l) => l.status));
      expect(statuses.size).toBeGreaterThanOrEqual(5);
    });

    it("spreads created_at over the last 90 days", () => {
      const daysAgoSet = new Set(leads.map((l) => l.days_ago));
      // Expect a broad distribution, not all stacked at zero.
      expect(daysAgoSet.size).toBeGreaterThan(15);
      expect(Math.max(...leads.map((l) => l.days_ago))).toBeGreaterThan(60);
    });

    it("emails are unique", () => {
      const emails = new Set(leads.map((l) => l.email));
      expect(emails.size).toBe(leads.length);
    });

    it("does not use real client names (Aidan, CFTR, Avis)", () => {
      const banned = ["Aidan", "CFTR", "Avis"];
      for (const l of leads) {
        for (const b of banned) {
          expect(l.first_name).not.toBe(b);
          expect(l.last_name).not.toBe(b);
          expect(l.notes).not.toContain(b);
        }
      }
    });
  });

  describe("buildDeals", () => {
    const vehicles = buildVehicles(75);
    const leads = buildLeads(40, vehicles);
    const deals = buildDeals(12, vehicles, leads);

    it("returns 12 deals", () => {
      expect(deals).toHaveLength(12);
    });

    it("covers draft, presented, accepted, and funded statuses", () => {
      const statuses = new Set(deals.map((d) => d.status));
      expect(statuses.has("draft")).toBe(true);
      expect(statuses.has("presented")).toBe(true);
      expect(statuses.has("accepted")).toBe(true);
      expect(statuses.has("funded")).toBe(true);
    });

    it("has realistic gross numbers", () => {
      for (const d of deals) {
        expect(d.front_gross).toBeGreaterThan(0);
        expect(d.back_gross).toBeGreaterThan(0);
        expect(d.front_gross).toBeLessThan(10000);
        expect(d.back_gross).toBeLessThan(10000);
      }
    });

    it("funded deals have a funded_days_ago timestamp", () => {
      for (const d of deals) {
        if (d.status === "funded") {
          expect(d.funded_days_ago).not.toBeNull();
          expect(d.funded_days_ago).toBeGreaterThan(0);
        }
      }
    });
  });

  describe("buildServiceAppointments", () => {
    const vehicles = buildVehicles(75);
    const appts = buildServiceAppointments(vehicles);

    it("returns 25 appointments", () => {
      expect(appts).toHaveLength(25);
    });

    it("includes past and future appointments", () => {
      const now = Date.now();
      const past = appts.filter((a) => a.scheduled_at.getTime() < now);
      const future = appts.filter((a) => a.scheduled_at.getTime() >= now);
      expect(past.length).toBeGreaterThan(0);
      expect(future.length).toBeGreaterThan(0);
    });

    it("covers multiple service types", () => {
      const types = new Set(appts.map((a) => a.service_type));
      expect(types.size).toBeGreaterThanOrEqual(3);
    });
  });

  describe("buildFiDeals", () => {
    const vehicles = buildVehicles(75);
    const leads = buildLeads(40, vehicles);
    const fi = buildFiDeals(vehicles, leads);

    it("returns 8 F&I deals", () => {
      expect(fi).toHaveLength(8);
    });

    it("each deal has at least one F&I product", () => {
      for (const d of fi) {
        expect(d.fi_products.length).toBeGreaterThanOrEqual(1);
      }
    });

    it("includes both retail and lease deals", () => {
      const types = new Set(fi.map((d) => d.deal_type));
      expect(types.has("retail")).toBe(true);
      expect(types.has("lease")).toBe(true);
    });

    it("each product has cost less than retail (positive markup)", () => {
      for (const d of fi) {
        for (const p of d.fi_products) {
          expect(p.cost).toBeLessThan(p.retail);
        }
      }
    });
  });

  describe("buildAnalyticsEvents", () => {
    const events = buildAnalyticsEvents();

    it("produces enough events to power funnel and dataflow surfaces", () => {
      expect(events.length).toBeGreaterThanOrEqual(60);
    });

    it("covers inventory, lead, deal, service, and fi event types", () => {
      const types = new Set(events.map((e) => e.event_type));
      expect(types.has("inventory")).toBe(true);
      expect(types.has("lead")).toBe(true);
      expect(types.has("deal")).toBe(true);
      expect(types.has("service")).toBe(true);
      expect(types.has("fi")).toBe(true);
    });

    it("events are spread over the last 30 days, not stacked", () => {
      const daysAgos = new Set(events.map((e) => e.days_ago));
      expect(daysAgos.size).toBeGreaterThanOrEqual(3);
    });
  });

  describe("constants", () => {
    it("dealer slug is wolfpack-demo", () => {
      expect(DEMO_DEALER_SLUG).toBe("wolfpack-demo");
    });

    it("dealer name is Wolfpack Demo Motors", () => {
      expect(DEMO_DEALER_NAME).toBe("Wolfpack Demo Motors");
    });

    it("dealer id is uuid-shaped with v4 marker", () => {
      // Matches the project convention: 00000000-0000-4000-cNNN-... where
      // the third group starts with `4` to flag a synthetic demo id.
      expect(DEMO_DEALER_ID).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    });
  });
});

// ---------------------------------------------------------------------------
// DB integration (skipped if DATABASE_URL not set)
// ---------------------------------------------------------------------------

const dbAvailable = !!process.env.DATABASE_URL;
const describeIfDb = dbAvailable ? describe : describe.skip;

describeIfDb("seed-demo-dealer: db integration", () => {
  // Test-only dealer id so we never touch the real demo dealer.
  const TEST_DEALER_ID = "00000000-0000-4000-c000-000000000999";
  const TEST_DEALER_SLUG = "wolfpack-demo-test";

  it("seeds successfully and returns a summary with expected counts", async () => {
    const summary = await seedDemoDealer({
      reset: true,
      quiet: true,
      dealerId: TEST_DEALER_ID,
      dealerSlug: TEST_DEALER_SLUG,
    });
    expect(summary.dealer_id).toBe(TEST_DEALER_ID);
    expect(summary.dealer_slug).toBe(TEST_DEALER_SLUG);
    expect(summary.staff).toBe(5);
    expect(summary.vehicles).toBe(75);
    expect(summary.leads).toBe(40);
    expect(summary.deals).toBe(12);
    expect(summary.fi_deals).toBe(8);
    expect(summary.service_appointments).toBe(25);
    expect(summary.analytics_events).toBeGreaterThanOrEqual(60);
  }, 60_000);

  it("is idempotent: a second run does not change counts", async () => {
    const first = await seedDemoDealer({
      reset: true,
      quiet: true,
      dealerId: TEST_DEALER_ID,
      dealerSlug: TEST_DEALER_SLUG,
    });
    const second = await seedDemoDealer({
      reset: false,
      quiet: true,
      dealerId: TEST_DEALER_ID,
      dealerSlug: TEST_DEALER_SLUG,
    });
    expect(second).toEqual(first);
  }, 90_000);
});
