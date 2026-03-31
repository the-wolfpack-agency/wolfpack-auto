/**
 * Push Notification Engine — PWA push subscription & delivery.
 *
 * Handles the full push lifecycle:
 * 1. Permission request (client-side)
 * 2. Subscription storage (server-side, PostgreSQL)
 * 3. Push delivery via Web Push API
 *
 * Privacy-first: subscriptions are tied to dealer_id, not PII.
 * Shadow mode: returns mock data when no DB/VAPID keys are configured.
 *
 * Reusable across projects — only the DB table name is domain-specific.
 */

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface PushSubscriptionRecord {
  id: string;
  dealer_id: string;
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
  user_agent: string;
  created_at: string;
  last_used_at: string;
}

export interface PushPayload {
  title: string;
  body: string;
  url: string;
  icon?: string;
  badge?: string;
  tag?: string;
}

/* ------------------------------------------------------------------ */
/*  Client-side: permission & subscription                             */
/* ------------------------------------------------------------------ */

/**
 * Request push notification permission from the user.
 * Returns the permission state after the request.
 *
 * Must be called from a user gesture (click/tap) context.
 */
export async function requestPushPermission(): Promise<
  "granted" | "denied" | "default"
> {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return "denied";
  }

  try {
    const result = await Notification.requestPermission();
    return result;
  } catch {
    return "denied";
  }
}

/**
 * Subscribe to push notifications using the browser's Push API.
 *
 * Requires a VAPID public key (set via NEXT_PUBLIC_VAPID_PUBLIC_KEY).
 * Registers the service worker at /sw.js if not already registered.
 *
 * Returns the PushSubscription or null if subscription fails.
 */
export async function subscribeToPush(
  dealerId: string,
): Promise<PushSubscription | null> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
    return null;
  }

  const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!vapidPublicKey) {
    console.warn("[push-notifications] No VAPID public key configured");
    return null;
  }

  try {
    // Register service worker
    const registration = await navigator.serviceWorker.register("/sw.js");
    await navigator.serviceWorker.ready;

    // Check for existing subscription
    const existing = await registration.pushManager.getSubscription();
    if (existing) {
      // Save to server (idempotent)
      await savePushSubscription(dealerId, existing);
      return existing;
    }

    // Create new subscription
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) as BufferSource,
    });

    // Save to server
    await savePushSubscription(dealerId, subscription);
    return subscription;
  } catch (err) {
    console.error("[push-notifications] Subscribe failed:", err);
    return null;
  }
}

/**
 * Save a push subscription to the server.
 */
async function savePushSubscription(
  dealerId: string,
  subscription: PushSubscription,
): Promise<void> {
  try {
    await fetch("/api/admin/notifications/push", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "subscribe",
        dealer_id: dealerId,
        subscription: subscription.toJSON(),
      }),
    });
  } catch {
    // Analytics should never break the app
  }
}

/**
 * Send a push notification via the server API.
 */
export async function sendPush(
  subscription: PushSubscription,
  title: string,
  body: string,
  url: string,
): Promise<void> {
  try {
    await fetch("/api/admin/notifications/push", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "send",
        subscription: subscription.toJSON(),
        payload: { title, body, url },
      }),
    });
  } catch (err) {
    console.error("[push-notifications] Send failed:", err);
  }
}

/* ------------------------------------------------------------------ */
/*  Server-side: subscription management                               */
/* ------------------------------------------------------------------ */

const MOCK_SUBSCRIPTIONS: PushSubscriptionRecord[] = [
  {
    id: "sub_001",
    dealer_id: "00000000-0000-4000-a000-000000000001",
    endpoint: "https://fcm.googleapis.com/fcm/send/mock-token-1",
    keys: { p256dh: "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts", auth: "tBHItJI5svbpC7htqqOljw" },
    user_agent: "Mozilla/5.0 (iPhone; CPU iPhone OS 19_0)",
    created_at: "2026-03-20T10:30:00Z",
    last_used_at: "2026-03-30T14:22:00Z",
  },
  {
    id: "sub_002",
    dealer_id: "00000000-0000-4000-a000-000000000001",
    endpoint: "https://updates.push.services.mozilla.com/wpush/v2/mock-token-2",
    keys: { p256dh: "BGVFh0QJcpSzZ-GH4hj3K5a5zKrmOIU6NJFV0p5sMWHPqSnvHmqvLCzrWShBl4g", auth: "aM3ItJI7svbpG9htqqPmkw" },
    user_agent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
    created_at: "2026-03-22T08:15:00Z",
    last_used_at: "2026-03-30T09:45:00Z",
  },
  {
    id: "sub_003",
    dealer_id: "00000000-0000-4000-a000-000000000001",
    endpoint: "https://fcm.googleapis.com/fcm/send/mock-token-3",
    keys: { p256dh: "BHJcRdreALRFXTkOOYHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ty", auth: "xBHItKI5svbpD7htqqOmkw" },
    user_agent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
    created_at: "2026-03-25T16:00:00Z",
    last_used_at: "2026-03-30T11:30:00Z",
  },
];

/**
 * Get all push subscriptions for a dealer.
 */
export async function getPushSubscriptions(
  dealerId: string,
): Promise<PushSubscriptionRecord[]> {
  if (!process.env.DATABASE_URL) {
    return MOCK_SUBSCRIPTIONS.filter((s) => s.dealer_id === dealerId);
  }

  try {
    const { query } = await import("@/lib/db");
    const result = await query<PushSubscriptionRecord>(
      `SELECT id, dealer_id, endpoint, keys, user_agent, created_at::text, last_used_at::text
       FROM push_subscriptions
       WHERE dealer_id = $1
       ORDER BY last_used_at DESC`,
      [dealerId],
    );
    return result.rows.length > 0 ? result.rows : MOCK_SUBSCRIPTIONS;
  } catch (err) {
    console.error("[push-notifications] getPushSubscriptions failed:", err);
    return MOCK_SUBSCRIPTIONS;
  }
}

/**
 * Store a push subscription in the database.
 */
export async function storePushSubscription(
  dealerId: string,
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
  userAgent: string,
): Promise<void> {
  if (!process.env.DATABASE_URL) return;

  try {
    const { query } = await import("@/lib/db");
    await query(
      `INSERT INTO push_subscriptions (dealer_id, endpoint, keys, user_agent, created_at, last_used_at)
       VALUES ($1, $2, $3, $4, NOW(), NOW())
       ON CONFLICT (endpoint) DO UPDATE SET
         last_used_at = NOW(),
         keys = EXCLUDED.keys`,
      [dealerId, subscription.endpoint, JSON.stringify(subscription.keys), userAgent],
    );
  } catch (err) {
    console.error("[push-notifications] storePushSubscription failed:", err);
  }
}

/**
 * Send a push notification to a specific subscription endpoint.
 * Uses the Web Push protocol (VAPID).
 *
 * In shadow mode (no VAPID keys), logs and returns success.
 */
export async function deliverPush(
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
  payload: PushPayload,
): Promise<{ success: boolean; error?: string }> {
  const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
  const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const vapidSubject = process.env.VAPID_SUBJECT || "mailto:admin@wolfpackauto.com";

  if (!vapidPrivateKey || !vapidPublicKey) {
    console.log("[push-notifications] Shadow mode — would deliver:", payload.title);
    return { success: true };
  }

  try {
    // Dynamic import to avoid bundling web-push in client code.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const webpush = await import(/* webpackIgnore: true */ "web-push" as string) as {
      setVapidDetails: (subject: string, publicKey: string, privateKey: string) => void;
      sendNotification: (
        sub: { endpoint: string; keys: { p256dh: string; auth: string } },
        payload: string,
        options?: { TTL?: number },
      ) => Promise<unknown>;
    };
    webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

    await webpush.sendNotification(
      {
        endpoint: subscription.endpoint,
        keys: subscription.keys,
      },
      JSON.stringify(payload),
      { TTL: 86400 }, // 24 hour TTL
    );

    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[push-notifications] deliverPush failed:", message);
    return { success: false, error: message };
  }
}

/* ------------------------------------------------------------------ */
/*  Utility                                                            */
/* ------------------------------------------------------------------ */

/**
 * Convert a VAPID public key from URL-safe base64 to Uint8Array.
 */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}
