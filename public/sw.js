/**
 * Service Worker — Push notification handler for PWA.
 *
 * Handles:
 *   - push: Show notification when received
 *   - notificationclick: Open URL and track click
 *   - notificationclose: Track dismissal
 *
 * Analytics events are sent back to the server via fetch().
 */

/* eslint-disable no-restricted-globals */

const ANALYTICS_ENDPOINT = "/api/analytics/events";

/**
 * Send an analytics event from the service worker context.
 * Fire-and-forget — never block notification handling.
 */
function trackEvent(eventType, action, metadata) {
  try {
    const event = {
      event_type: eventType,
      action: action,
      page: "service_worker",
      session_id: "sw_" + Date.now(),
      user_fingerprint: "service_worker",
      timestamp: new Date().toISOString(),
      metadata: metadata || {},
    };

    fetch(ANALYTICS_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ events: [event] }),
    }).catch(function () {
      // Silently drop — analytics should never break notifications
    });
  } catch (e) {
    // Silently drop
  }
}

/**
 * Handle incoming push notification.
 */
self.addEventListener("push", function (event) {
  var data = { title: "New Update", body: "", url: "/" };

  if (event.data) {
    try {
      data = Object.assign(data, event.data.json());
    } catch (e) {
      data.body = event.data.text();
    }
  }

  var options = {
    body: data.body,
    icon: data.icon || "/icon-192x192.png",
    badge: data.badge || "/icon-72x72.png",
    tag: data.tag || "default",
    data: { url: data.url || "/" },
    vibrate: [200, 100, 200],
    actions: [
      { action: "open", title: "View" },
      { action: "dismiss", title: "Dismiss" },
    ],
  };

  // Track push received
  trackEvent("push_engagement", "push_received", {
    title: data.title,
    tag: data.tag || "default",
  });

  event.waitUntil(self.registration.showNotification(data.title, options));
});

/**
 * Handle notification click — open the target URL.
 */
self.addEventListener("notificationclick", function (event) {
  event.notification.close();

  var url = event.notification.data && event.notification.data.url
    ? event.notification.data.url
    : "/";

  if (event.action === "dismiss") {
    // Track dismissal via action button
    trackEvent("push_engagement", "push_dismissed", {
      title: event.notification.title,
      tag: event.notification.tag,
      method: "action_button",
    });
    return;
  }

  // Track click
  trackEvent("push_engagement", "push_clicked", {
    title: event.notification.title,
    tag: event.notification.tag,
    url: url,
  });

  // Open the target URL in an existing tab or new window
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (clientList) {
      // Try to focus an existing tab with the same origin
      for (var i = 0; i < clientList.length; i++) {
        var client = clientList[i];
        if (client.url.indexOf(self.location.origin) !== -1 && "focus" in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      // No existing tab — open a new window
      if (self.clients.openWindow) {
        return self.clients.openWindow(url);
      }
    })
  );
});

/**
 * Handle notification close (swipe away / X button).
 */
self.addEventListener("notificationclose", function (event) {
  trackEvent("push_engagement", "push_dismissed", {
    title: event.notification.title,
    tag: event.notification.tag,
    method: "close_button",
  });
});

/**
 * Service worker install — skip waiting to activate immediately.
 */
self.addEventListener("install", function () {
  self.skipWaiting();
});

/**
 * Service worker activate — claim all clients immediately.
 */
self.addEventListener("activate", function (event) {
  event.waitUntil(self.clients.claim());
});
