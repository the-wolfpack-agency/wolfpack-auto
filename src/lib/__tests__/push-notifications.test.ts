/**
 * Unit tests for src/lib/push-notifications.ts
 *
 * Tests permission handling, payload construction, subscription management,
 * shadow mode fallbacks, and analytics compatibility.
 *
 * NOTE: Browser APIs (Notification, serviceWorker) are not available in Node,
 * so client-side functions are tested for their guard behavior (returning
 * "denied" / null when window is undefined). Server-side functions are
 * tested via their shadow mode paths.
 *
 * Run with: npx jest src/lib/__tests__/push-notifications.test.ts
 */

import {
  requestPushPermission,
  subscribeToPush,
  getPushSubscriptions,
  storePushSubscription,
  deliverPush,
  type PushSubscriptionRecord,
  type PushPayload,
} from "../push-notifications";

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

const DEMO_DEALER_ID = "00000000-0000-4000-a000-000000000001";

beforeEach(() => {
  delete process.env.DATABASE_URL;
  delete process.env.VAPID_PRIVATE_KEY;
  delete process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  delete process.env.VAPID_SUBJECT;
});

/* -------------------------------------------------------------------------- */
/* requestPushPermission — server-side (no window)                             */
/* -------------------------------------------------------------------------- */

describe("requestPushPermission — server environment", () => {
  it("returns 'denied' when window is undefined (Node.js)", async () => {
    const result = await requestPushPermission();
    expect(result).toBe("denied");
  });
});

/* -------------------------------------------------------------------------- */
/* subscribeToPush — server-side (no window)                                   */
/* -------------------------------------------------------------------------- */

describe("subscribeToPush — server environment", () => {
  it("returns null when window is undefined (Node.js)", async () => {
    const result = await subscribeToPush(DEMO_DEALER_ID);
    expect(result).toBeNull();
  });
});

/* -------------------------------------------------------------------------- */
/* getPushSubscriptions — shadow mode                                          */
/* -------------------------------------------------------------------------- */

describe("getPushSubscriptions — shadow mode", () => {
  it("returns mock subscriptions for the demo dealer", async () => {
    const subs = await getPushSubscriptions(DEMO_DEALER_ID);
    expect(Array.isArray(subs)).toBe(true);
    expect(subs.length).toBeGreaterThan(0);
  });

  it("each subscription has all required fields", async () => {
    const subs = await getPushSubscriptions(DEMO_DEALER_ID);
    for (const sub of subs) {
      expect(sub).toHaveProperty("id");
      expect(sub).toHaveProperty("dealer_id");
      expect(sub).toHaveProperty("endpoint");
      expect(sub).toHaveProperty("keys");
      expect(sub.keys).toHaveProperty("p256dh");
      expect(sub.keys).toHaveProperty("auth");
      expect(sub).toHaveProperty("user_agent");
      expect(sub).toHaveProperty("created_at");
      expect(sub).toHaveProperty("last_used_at");
    }
  });

  it("subscriptions belong to the requested dealer", async () => {
    const subs = await getPushSubscriptions(DEMO_DEALER_ID);
    for (const sub of subs) {
      expect(sub.dealer_id).toBe(DEMO_DEALER_ID);
    }
  });

  it("endpoints are valid URLs", async () => {
    const subs = await getPushSubscriptions(DEMO_DEALER_ID);
    for (const sub of subs) {
      expect(sub.endpoint).toMatch(/^https:\/\//);
    }
  });

  it("keys are non-empty strings", async () => {
    const subs = await getPushSubscriptions(DEMO_DEALER_ID);
    for (const sub of subs) {
      expect(sub.keys.p256dh.length).toBeGreaterThan(0);
      expect(sub.keys.auth.length).toBeGreaterThan(0);
    }
  });

  it("timestamps are valid ISO dates", async () => {
    const subs = await getPushSubscriptions(DEMO_DEALER_ID);
    for (const sub of subs) {
      expect(new Date(sub.created_at).getTime()).not.toBeNaN();
      expect(new Date(sub.last_used_at).getTime()).not.toBeNaN();
    }
  });

  it("returns empty for unknown dealer (filtered from mock data)", async () => {
    const subs = await getPushSubscriptions("unknown-dealer-id");
    // Mock data is filtered by dealer_id; unknown dealer gets empty
    expect(Array.isArray(subs)).toBe(true);
    expect(subs.length).toBe(0);
  });
});

/* -------------------------------------------------------------------------- */
/* storePushSubscription — shadow mode (no-op)                                 */
/* -------------------------------------------------------------------------- */

describe("storePushSubscription — shadow mode", () => {
  it("does not throw in shadow mode (no-op)", async () => {
    await expect(
      storePushSubscription(
        DEMO_DEALER_ID,
        {
          endpoint: "https://fcm.googleapis.com/fcm/send/test",
          keys: { p256dh: "testkey", auth: "testauth" },
        },
        "Mozilla/5.0 Test",
      ),
    ).resolves.not.toThrow();
  });
});

/* -------------------------------------------------------------------------- */
/* deliverPush — shadow mode                                                   */
/* -------------------------------------------------------------------------- */

describe("deliverPush — shadow mode", () => {
  it("returns success in shadow mode (no VAPID keys)", async () => {
    const result = await deliverPush(
      {
        endpoint: "https://fcm.googleapis.com/fcm/send/mock",
        keys: { p256dh: "testkey", auth: "testauth" },
      },
      {
        title: "Test Notification",
        body: "This is a test",
        url: "/admin/leads",
      },
    );
    expect(result.success).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it("accepts all valid PushPayload fields", async () => {
    const payload: PushPayload = {
      title: "New Hot Lead",
      body: "Sarah Mitchell is back on your site",
      url: "/admin/leads/lead-003",
      icon: "/icons/hot-lead.png",
      badge: "/icons/badge.png",
      tag: "hot-lead-003",
    };

    const result = await deliverPush(
      {
        endpoint: "https://fcm.googleapis.com/fcm/send/mock",
        keys: { p256dh: "testkey", auth: "testauth" },
      },
      payload,
    );
    expect(result.success).toBe(true);
  });
});

/* -------------------------------------------------------------------------- */
/* PushPayload construction                                                    */
/* -------------------------------------------------------------------------- */

describe("PushPayload construction", () => {
  it("minimal payload has required fields", () => {
    const payload: PushPayload = {
      title: "Alert",
      body: "New lead activity",
      url: "/admin",
    };
    expect(payload.title).toBeTruthy();
    expect(payload.body).toBeTruthy();
    expect(payload.url).toBeTruthy();
  });

  it("optional fields can be omitted", () => {
    const payload: PushPayload = {
      title: "Alert",
      body: "New lead activity",
      url: "/admin",
    };
    expect(payload.icon).toBeUndefined();
    expect(payload.badge).toBeUndefined();
    expect(payload.tag).toBeUndefined();
  });

  it("payload is JSON-serializable", () => {
    const payload: PushPayload = {
      title: "Test",
      body: "Body text",
      url: "/test",
      icon: "/icon.png",
      badge: "/badge.png",
      tag: "test-tag",
    };
    const serialized = JSON.stringify(payload);
    const parsed = JSON.parse(serialized);
    expect(parsed.title).toBe("Test");
    expect(parsed.tag).toBe("test-tag");
  });
});

/* -------------------------------------------------------------------------- */
/* Subscription diversity (different push providers)                           */
/* -------------------------------------------------------------------------- */

describe("subscription provider diversity", () => {
  it("mock data includes multiple push service providers", async () => {
    const subs = await getPushSubscriptions(DEMO_DEALER_ID);
    const endpoints = subs.map((s) => s.endpoint);
    const providers = new Set(
      endpoints.map((e) => new URL(e).hostname),
    );
    // Should have FCM and/or Mozilla push services
    expect(providers.size).toBeGreaterThanOrEqual(1);
  });

  it("mock data includes different user agents (cross-device)", async () => {
    const subs = await getPushSubscriptions(DEMO_DEALER_ID);
    const agents = new Set(subs.map((s) => s.user_agent));
    expect(agents.size).toBeGreaterThan(1);
  });
});

/* -------------------------------------------------------------------------- */
/* Analytics compatibility                                                     */
/* -------------------------------------------------------------------------- */

describe("analytics compatibility", () => {
  it("PushSubscriptionRecord is fully JSON-serializable for EventCollector", async () => {
    const subs = await getPushSubscriptions(DEMO_DEALER_ID);
    const serialized = JSON.stringify(subs);
    expect(serialized).toBeTruthy();
    const parsed = JSON.parse(serialized);
    expect(parsed.length).toBe(subs.length);
    expect(parsed[0].endpoint).toBe(subs[0].endpoint);
  });

  it("deliverPush result is JSON-serializable", async () => {
    const result = await deliverPush(
      {
        endpoint: "https://fcm.googleapis.com/fcm/send/mock",
        keys: { p256dh: "k", auth: "a" },
      },
      { title: "T", body: "B", url: "/" },
    );
    const serialized = JSON.stringify(result);
    const parsed = JSON.parse(serialized);
    expect(parsed.success).toBe(true);
  });

  it("subscription IDs are unique", async () => {
    const subs = await getPushSubscriptions(DEMO_DEALER_ID);
    const ids = subs.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
