/**
 * Unit tests for src/lib/lookalike-engine.ts
 *
 * Tests collaborative filtering, "Shoppers Also Viewed" recommendations,
 * mock data quality, and analytics compatibility.
 *
 * All public functions fall back to mock data in shadow mode (no DATABASE_URL),
 * so these tests validate the shadow path thoroughly.
 *
 * Run with: npx jest src/lib/__tests__/lookalike-engine.test.ts
 */

import {
  getRelatedVehicles,
  getRecommendationsForUser,
  type RelatedVehicle,
  type RecommendedVehicle,
} from "../lookalike-engine";

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

const DEMO_DEALER_ID = "00000000-0000-4000-a000-000000000001";
const SAMPLE_VIN = "1HGBH41JXMN109186";
const UNKNOWN_VIN = "ZZZZZZZZZZZZZZZZZ";
const SAMPLE_FINGERPRINT = "fp-abc-123";

beforeEach(() => {
  delete process.env.DATABASE_URL;
});

/* -------------------------------------------------------------------------- */
/* getRelatedVehicles — "Shoppers Also Viewed"                                 */
/* -------------------------------------------------------------------------- */

describe("getRelatedVehicles", () => {
  it("returns an array of RelatedVehicle objects", async () => {
    const related = await getRelatedVehicles(SAMPLE_VIN, DEMO_DEALER_ID);
    expect(Array.isArray(related)).toBe(true);
    expect(related.length).toBeGreaterThan(0);
  });

  it("each vehicle has all required fields", async () => {
    const related = await getRelatedVehicles(SAMPLE_VIN, DEMO_DEALER_ID);
    for (const v of related) {
      expect(v).toHaveProperty("vin");
      expect(v).toHaveProperty("year");
      expect(v).toHaveProperty("make");
      expect(v).toHaveProperty("model");
      expect(v).toHaveProperty("price");
      expect(v).toHaveProperty("score");
      expect(v).toHaveProperty("reason");
    }
  });

  it("does not include the queried VIN in results", async () => {
    const related = await getRelatedVehicles(SAMPLE_VIN, DEMO_DEALER_ID);
    const vins = related.map((v) => v.vin);
    expect(vins).not.toContain(SAMPLE_VIN);
  });

  it("scores are between 0 and 1", async () => {
    const related = await getRelatedVehicles(SAMPLE_VIN, DEMO_DEALER_ID);
    for (const v of related) {
      expect(v.score).toBeGreaterThanOrEqual(0);
      expect(v.score).toBeLessThanOrEqual(1);
    }
  });

  it("results are sorted by score descending", async () => {
    const related = await getRelatedVehicles(SAMPLE_VIN, DEMO_DEALER_ID);
    for (let i = 1; i < related.length; i++) {
      expect(related[i - 1].score).toBeGreaterThanOrEqual(related[i].score);
    }
  });

  it("reason is a human-readable string", async () => {
    const related = await getRelatedVehicles(SAMPLE_VIN, DEMO_DEALER_ID);
    for (const v of related) {
      expect(v.reason.length).toBeGreaterThan(10);
      expect(v.reason).toContain("shoppers");
    }
  });

  it("respects the limit parameter", async () => {
    const two = await getRelatedVehicles(SAMPLE_VIN, DEMO_DEALER_ID, 2);
    expect(two.length).toBeLessThanOrEqual(2);

    const five = await getRelatedVehicles(SAMPLE_VIN, DEMO_DEALER_ID, 5);
    expect(five.length).toBeLessThanOrEqual(5);
  });

  it("uses default limit of 5", async () => {
    const related = await getRelatedVehicles(SAMPLE_VIN, DEMO_DEALER_ID);
    expect(related.length).toBeLessThanOrEqual(5);
  });

  it("returns results for unknown VINs (mock fallback)", async () => {
    const related = await getRelatedVehicles(UNKNOWN_VIN, DEMO_DEALER_ID);
    expect(related.length).toBeGreaterThan(0);
  });
});

/* -------------------------------------------------------------------------- */
/* getRelatedVehicles — vehicle data quality                                   */
/* -------------------------------------------------------------------------- */

describe("getRelatedVehicles — data quality", () => {
  it("VINs are non-empty strings", async () => {
    const related = await getRelatedVehicles(SAMPLE_VIN, DEMO_DEALER_ID);
    for (const v of related) {
      expect(typeof v.vin).toBe("string");
      expect(v.vin.length).toBeGreaterThan(0);
    }
  });

  it("years are realistic (2020+)", async () => {
    const related = await getRelatedVehicles(SAMPLE_VIN, DEMO_DEALER_ID);
    for (const v of related) {
      expect(v.year).toBeGreaterThanOrEqual(2020);
      expect(v.year).toBeLessThanOrEqual(2030);
    }
  });

  it("prices are positive numbers", async () => {
    const related = await getRelatedVehicles(SAMPLE_VIN, DEMO_DEALER_ID);
    for (const v of related) {
      expect(v.price).toBeGreaterThan(0);
    }
  });

  it("make and model are non-empty strings", async () => {
    const related = await getRelatedVehicles(SAMPLE_VIN, DEMO_DEALER_ID);
    for (const v of related) {
      expect(v.make.length).toBeGreaterThan(0);
      expect(v.model.length).toBeGreaterThan(0);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* getRecommendationsForUser — personalized recs                               */
/* -------------------------------------------------------------------------- */

describe("getRecommendationsForUser", () => {
  it("returns an array of RecommendedVehicle objects", async () => {
    const recs = await getRecommendationsForUser(
      SAMPLE_FINGERPRINT,
      DEMO_DEALER_ID,
    );
    expect(Array.isArray(recs)).toBe(true);
    expect(recs.length).toBeGreaterThan(0);
  });

  it("each recommendation has all required fields", async () => {
    const recs = await getRecommendationsForUser(
      SAMPLE_FINGERPRINT,
      DEMO_DEALER_ID,
    );
    for (const r of recs) {
      expect(r).toHaveProperty("vin");
      expect(r).toHaveProperty("year");
      expect(r).toHaveProperty("make");
      expect(r).toHaveProperty("model");
      expect(r).toHaveProperty("price");
      expect(r).toHaveProperty("score");
      expect(r).toHaveProperty("reason");
    }
  });

  it("scores are between 0 and 1", async () => {
    const recs = await getRecommendationsForUser(
      SAMPLE_FINGERPRINT,
      DEMO_DEALER_ID,
    );
    for (const r of recs) {
      expect(r.score).toBeGreaterThanOrEqual(0);
      expect(r.score).toBeLessThanOrEqual(1);
    }
  });

  it("results are sorted by score descending", async () => {
    const recs = await getRecommendationsForUser(
      SAMPLE_FINGERPRINT,
      DEMO_DEALER_ID,
    );
    for (let i = 1; i < recs.length; i++) {
      expect(recs[i - 1].score).toBeGreaterThanOrEqual(recs[i].score);
    }
  });

  it("reason explains the recommendation basis", async () => {
    const recs = await getRecommendationsForUser(
      SAMPLE_FINGERPRINT,
      DEMO_DEALER_ID,
    );
    for (const r of recs) {
      expect(r.reason.length).toBeGreaterThan(10);
      expect(r.reason.toLowerCase()).toContain("similar shoppers");
    }
  });

  it("respects the limit parameter", async () => {
    const three = await getRecommendationsForUser(
      SAMPLE_FINGERPRINT,
      DEMO_DEALER_ID,
      3,
    );
    expect(three.length).toBeLessThanOrEqual(3);
  });

  it("uses default limit of 5", async () => {
    const recs = await getRecommendationsForUser(
      SAMPLE_FINGERPRINT,
      DEMO_DEALER_ID,
    );
    expect(recs.length).toBeLessThanOrEqual(5);
  });
});

/* -------------------------------------------------------------------------- */
/* Privacy — no PII in recommendations                                         */
/* -------------------------------------------------------------------------- */

describe("privacy", () => {
  it("related vehicles contain no session/user identifiers", async () => {
    const related = await getRelatedVehicles(SAMPLE_VIN, DEMO_DEALER_ID);
    const json = JSON.stringify(related);
    expect(json).not.toContain("session_id");
    expect(json).not.toContain("user_fingerprint");
    expect(json).not.toContain("email");
  });

  it("recommendations contain no session/user identifiers", async () => {
    const recs = await getRecommendationsForUser(
      SAMPLE_FINGERPRINT,
      DEMO_DEALER_ID,
    );
    const json = JSON.stringify(recs);
    expect(json).not.toContain(SAMPLE_FINGERPRINT);
    expect(json).not.toContain("email");
  });
});

/* -------------------------------------------------------------------------- */
/* Analytics compatibility                                                     */
/* -------------------------------------------------------------------------- */

describe("analytics compatibility", () => {
  it("RelatedVehicle is fully JSON-serializable for EventCollector", async () => {
    const related = await getRelatedVehicles(SAMPLE_VIN, DEMO_DEALER_ID);
    const serialized = JSON.stringify(related);
    expect(serialized).toBeTruthy();
    const parsed = JSON.parse(serialized);
    expect(parsed.length).toBe(related.length);
    expect(parsed[0].vin).toBe(related[0].vin);
    expect(parsed[0].score).toBe(related[0].score);
  });

  it("RecommendedVehicle is fully JSON-serializable", async () => {
    const recs = await getRecommendationsForUser(
      SAMPLE_FINGERPRINT,
      DEMO_DEALER_ID,
    );
    const serialized = JSON.stringify(recs);
    const parsed = JSON.parse(serialized);
    expect(parsed.length).toBe(recs.length);
    expect(parsed[0].make).toBe(recs[0].make);
  });

  it("recommendation scores are primitive numbers (not objects)", async () => {
    const recs = await getRecommendationsForUser(
      SAMPLE_FINGERPRINT,
      DEMO_DEALER_ID,
    );
    for (const r of recs) {
      expect(typeof r.score).toBe("number");
      expect(Number.isFinite(r.score)).toBe(true);
    }
  });
});
