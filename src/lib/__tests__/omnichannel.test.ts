/**
 * Omnichannel — Tests
 *
 * Covers: handoff creation, timeline building, QR generation,
 * channel merging, session management, handoff scanning.
 */

import * as fs from "fs";
import * as path from "path";

jest.mock("@/lib/analytics-hooks", () => ({
  trackOmnichannel: jest.fn(),
}));

jest.mock("@/lib/db", () => ({
  query: jest.fn(),
}));

import {
  createHandoff,
  getOmnichannelTimeline,
  getOmnichannelProfile,
  mergeOnlineAndStoreActivity,
  generateQRHandoff,
  recordTouchpoint,
  scanHandoff,
  _resetForTesting,
} from "@/lib/omnichannel";

beforeEach(() => {
  _resetForTesting();
  delete process.env.DATABASE_URL;
});

/* ------------------------------------------------------------------ */
/*  Handoff creation                                                   */
/* ------------------------------------------------------------------ */

describe("createHandoff", () => {
  it("creates a handoff with token and QR URL", async () => {
    const handoff = await createHandoff("cust-1", "online", "in_store", "dealer-1");
    expect(handoff.handoffId).toBeTruthy();
    expect(handoff.customerId).toBe("cust-1");
    expect(handoff.fromChannel).toBe("online");
    expect(handoff.toChannel).toBe("in_store");
    expect(handoff.token).toHaveLength(32);
    expect(handoff.qrUrl).toContain("/handoff/");
    expect(handoff.scanned).toBe(false);
  });

  it("sets expiry to 24 hours from creation", async () => {
    const handoff = await createHandoff("cust-2", "phone", "in_store", "dealer-1");
    const created = new Date(handoff.createdAt).getTime();
    const expires = new Date(handoff.expiresAt).getTime();
    const hours = (expires - created) / (1000 * 60 * 60);
    expect(hours).toBeCloseTo(24, 0);
  });

  it("records a touchpoint for the handoff", async () => {
    await createHandoff("cust-3", "email", "in_store", "dealer-1");
    const timeline = await getOmnichannelTimeline("cust-3");
    expect(timeline.length).toBeGreaterThanOrEqual(1);
    expect(timeline[0].summary).toContain("Handoff created");
  });
});

/* ------------------------------------------------------------------ */
/*  Timeline                                                           */
/* ------------------------------------------------------------------ */

describe("getOmnichannelTimeline", () => {
  it("returns empty array for unknown customer", async () => {
    expect(await getOmnichannelTimeline("unknown")).toEqual([]);
  });

  it("returns touchpoints sorted by timestamp", async () => {
    await recordTouchpoint("cust-t", "online", "Browsed inventory");
    await recordTouchpoint("cust-t", "phone", "Called about RAV4");
    await recordTouchpoint("cust-t", "in_store", "Test drove RAV4");

    const timeline = await getOmnichannelTimeline("cust-t");
    expect(timeline).toHaveLength(3);
    expect(timeline[0].channel).toBe("online");
    expect(timeline[2].channel).toBe("in_store");
  });
});

/* ------------------------------------------------------------------ */
/*  QR generation                                                      */
/* ------------------------------------------------------------------ */

describe("generateQRHandoff", () => {
  it("generates a URL with session ID", () => {
    const url = generateQRHandoff("sess-123");
    expect(url).toContain("/handoff/sess-123");
    expect(url).toContain("token=");
  });

  it("uses provided token when given", () => {
    const url = generateQRHandoff("sess-456", "my-token");
    expect(url).toBe("/handoff/sess-456?token=my-token");
  });
});

/* ------------------------------------------------------------------ */
/*  Channel merging                                                    */
/* ------------------------------------------------------------------ */

describe("mergeOnlineAndStoreActivity", () => {
  it("separates online and in-store touchpoints", async () => {
    await recordTouchpoint("cust-m", "online", "Page view");
    await recordTouchpoint("cust-m", "in_store", "Walk-in");
    await recordTouchpoint("cust-m", "online", "Chat started");

    const result = await mergeOnlineAndStoreActivity("cust-m");
    expect(result.online).toHaveLength(2);
    expect(result.inStore).toHaveLength(1);
    expect(result.merged).toHaveLength(3);
  });
});

/* ------------------------------------------------------------------ */
/*  Profile                                                            */
/* ------------------------------------------------------------------ */

describe("getOmnichannelProfile", () => {
  it("builds profile with correct channel stats", async () => {
    await recordTouchpoint("cust-p", "online", "View 1");
    await recordTouchpoint("cust-p", "online", "View 2");
    await recordTouchpoint("cust-p", "phone", "Call 1");

    const profile = await getOmnichannelProfile("cust-p", "dealer-1");
    expect(profile.totalInteractions).toBe(3);
    expect(profile.channels).toContain("online");
    expect(profile.channels).toContain("phone");
    expect(profile.preferredChannel).toBe("online");
  });
});

/* ------------------------------------------------------------------ */
/*  Handoff scanning                                                   */
/* ------------------------------------------------------------------ */

describe("scanHandoff", () => {
  it("marks handoff as scanned with correct token", async () => {
    const handoff = await createHandoff("cust-s", "online", "in_store", "dealer-1");
    const scanned = await scanHandoff(handoff.handoffId, handoff.token);
    expect(scanned).not.toBeNull();
    expect((scanned as any).scanned).toBe(true);
  });

  it("rejects wrong token", async () => {
    const handoff = await createHandoff("cust-s2", "online", "in_store", "dealer-1");
    const result = await scanHandoff(handoff.handoffId, "wrong-token");
    expect(result).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/*  File structure                                                     */
/* ------------------------------------------------------------------ */

describe("file structure", () => {
  const base = path.resolve(__dirname, "../../..");

  it("has API route", () => {
    expect(
      fs.existsSync(path.join(base, "src/app/api/admin/omnichannel/route.ts")),
    ).toBe(true);
  });

  it("has admin page", () => {
    expect(
      fs.existsSync(path.join(base, "src/app/admin/omnichannel/page.tsx")),
    ).toBe(true);
  });

  it("has sidebar link", () => {
    const sidebar = fs.readFileSync(
      path.join(base, "src/components/AdminSidebar.tsx"),
      "utf-8",
    );
    expect(sidebar).toContain("/admin/omnichannel");
  });
});
