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
});

/* ------------------------------------------------------------------ */
/*  Handoff creation                                                   */
/* ------------------------------------------------------------------ */

describe("createHandoff", () => {
  it("creates a handoff with token and QR URL", () => {
    const handoff = createHandoff("cust-1", "online", "in_store", "dealer-1");
    expect(handoff.handoffId).toBeTruthy();
    expect(handoff.customerId).toBe("cust-1");
    expect(handoff.fromChannel).toBe("online");
    expect(handoff.toChannel).toBe("in_store");
    expect(handoff.token).toHaveLength(32);
    expect(handoff.qrUrl).toContain("/handoff/");
    expect(handoff.scanned).toBe(false);
  });

  it("sets expiry to 24 hours from creation", () => {
    const handoff = createHandoff("cust-2", "phone", "in_store", "dealer-1");
    const created = new Date(handoff.createdAt).getTime();
    const expires = new Date(handoff.expiresAt).getTime();
    const hours = (expires - created) / (1000 * 60 * 60);
    expect(hours).toBeCloseTo(24, 0);
  });

  it("records a touchpoint for the handoff", () => {
    createHandoff("cust-3", "email", "in_store", "dealer-1");
    const timeline = getOmnichannelTimeline("cust-3");
    expect(timeline.length).toBeGreaterThanOrEqual(1);
    expect(timeline[0].summary).toContain("Handoff created");
  });
});

/* ------------------------------------------------------------------ */
/*  Timeline                                                           */
/* ------------------------------------------------------------------ */

describe("getOmnichannelTimeline", () => {
  it("returns empty array for unknown customer", () => {
    expect(getOmnichannelTimeline("unknown")).toEqual([]);
  });

  it("returns touchpoints sorted by timestamp", () => {
    recordTouchpoint("cust-t", "online", "Browsed inventory");
    recordTouchpoint("cust-t", "phone", "Called about RAV4");
    recordTouchpoint("cust-t", "in_store", "Test drove RAV4");

    const timeline = getOmnichannelTimeline("cust-t");
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
  it("separates online and in-store touchpoints", () => {
    recordTouchpoint("cust-m", "online", "Page view");
    recordTouchpoint("cust-m", "in_store", "Walk-in");
    recordTouchpoint("cust-m", "online", "Chat started");

    const result = mergeOnlineAndStoreActivity("cust-m");
    expect(result.online).toHaveLength(2);
    expect(result.inStore).toHaveLength(1);
    expect(result.merged).toHaveLength(3);
  });
});

/* ------------------------------------------------------------------ */
/*  Profile                                                            */
/* ------------------------------------------------------------------ */

describe("getOmnichannelProfile", () => {
  it("builds profile with correct channel stats", () => {
    recordTouchpoint("cust-p", "online", "View 1");
    recordTouchpoint("cust-p", "online", "View 2");
    recordTouchpoint("cust-p", "phone", "Call 1");

    const profile = getOmnichannelProfile("cust-p", "dealer-1");
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
  it("marks handoff as scanned with correct token", () => {
    const handoff = createHandoff("cust-s", "online", "in_store", "dealer-1");
    const scanned = scanHandoff(handoff.handoffId, handoff.token);
    expect(scanned).not.toBeNull();
    expect((scanned as any).scanned).toBe(true);
  });

  it("rejects wrong token", () => {
    const handoff = createHandoff("cust-s2", "online", "in_store", "dealer-1");
    const result = scanHandoff(handoff.handoffId, "wrong-token");
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
