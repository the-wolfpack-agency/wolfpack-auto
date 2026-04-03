import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthenticated } from "@/lib/auth-guard";
import { getDealerId } from "@/lib/get-dealer-id";
import {
  getPushSubscriptions,
  storePushSubscription,
  deliverPush,
} from "@/lib/push-notifications";
import { trackSystem } from "@/lib/analytics-hooks";

/**
 * GET /api/admin/notifications/push
 *
 * List push subscriptions for the authenticated dealer.
 */
export async function GET() {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ sent: false, message: "No database configured" });
  }

  const auth = await requireAuth();
  if (!isAuthenticated(auth)) return auth;

  const dealerId = getDealerId(auth);

  try {
    const subscriptions = await getPushSubscriptions(dealerId);

    trackSystem("system.analytics_queried", dealerId, {
      query_type: "push_subscriptions",
      result_count: subscriptions.length,
    });

    return NextResponse.json({
      subscriptions,
      count: subscriptions.length,
    });
  } catch (err) {
    console.error("[push-notifications] GET failed:", err);
    return NextResponse.json(
      { error: "Failed to retrieve push subscriptions" },
      { status: 500 },
    );
  }
}

/**
 * POST /api/admin/notifications/push
 *
 * Actions:
 *   - subscribe: Store a new push subscription
 *   - send: Send a push notification to a specific subscription
 *   - broadcast: Send a push notification to all dealer subscriptions
 */
export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if (!isAuthenticated(auth)) return auth;

  const dealerId = getDealerId(auth);

  try {
    const body = await request.json();
    const action = body.action;

    if (action === "subscribe") {
      const { subscription } = body;
      if (!subscription?.endpoint || !subscription?.keys) {
        return NextResponse.json(
          { error: "Invalid subscription object — need endpoint and keys" },
          { status: 400 },
        );
      }

      await storePushSubscription(
        body.dealer_id || dealerId,
        {
          endpoint: subscription.endpoint,
          keys: {
            p256dh: subscription.keys.p256dh,
            auth: subscription.keys.auth,
          },
        },
        request.headers.get("user-agent") ?? "unknown",
      );

      trackSystem("system.change_recorded", dealerId, {
        change_type: "push_subscription_added",
        endpoint_domain: new URL(subscription.endpoint).hostname,
      });

      return NextResponse.json({ success: true, action: "subscribed" });
    }

    if (action === "send") {
      const { subscription, payload } = body;
      if (!subscription?.endpoint || !payload?.title) {
        return NextResponse.json(
          { error: "Need subscription.endpoint and payload.title" },
          { status: 400 },
        );
      }

      const result = await deliverPush(
        {
          endpoint: subscription.endpoint,
          keys: subscription.keys ?? { p256dh: "", auth: "" },
        },
        {
          title: payload.title,
          body: payload.body ?? "",
          url: payload.url ?? "/",
          icon: payload.icon,
          badge: payload.badge,
          tag: payload.tag,
        },
      );

      trackSystem("system.change_recorded", dealerId, {
        change_type: "push_notification_sent",
        success: result.success,
        title: payload.title,
      });

      return NextResponse.json(result);
    }

    if (action === "broadcast") {
      const { payload } = body;
      if (!payload?.title) {
        return NextResponse.json(
          { error: "Need payload.title for broadcast" },
          { status: 400 },
        );
      }

      const subscriptions = await getPushSubscriptions(dealerId);
      const results = await Promise.allSettled(
        subscriptions.map((sub) =>
          deliverPush(
            { endpoint: sub.endpoint, keys: sub.keys },
            {
              title: payload.title,
              body: payload.body ?? "",
              url: payload.url ?? "/",
              icon: payload.icon,
              badge: payload.badge,
              tag: payload.tag,
            },
          ),
        ),
      );

      const sent = results.filter(
        (r) => r.status === "fulfilled" && r.value.success,
      ).length;
      const failed = results.length - sent;

      trackSystem("system.change_recorded", dealerId, {
        change_type: "push_notification_broadcast",
        total: results.length,
        sent,
        failed,
      });

      return NextResponse.json({
        success: true,
        action: "broadcast",
        total: results.length,
        sent,
        failed,
      });
    }

    return NextResponse.json(
      { error: `Unknown action: ${action}. Use 'subscribe', 'send', or 'broadcast'.` },
      { status: 400 },
    );
  } catch (err) {
    console.error("[push-notifications] POST failed:", err);
    return NextResponse.json(
      { error: "Failed to process push notification request" },
      { status: 500 },
    );
  }
}
