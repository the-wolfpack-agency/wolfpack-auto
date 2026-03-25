"use client";

import Script from "next/script";

/**
 * Plausible analytics — privacy-friendly, cookie-free.
 *
 * Only loads when NEXT_PUBLIC_PLAUSIBLE_DOMAIN is set.
 * Automatically tracks page views; exports `trackEvent()` for custom events.
 */

const DOMAIN = process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN;
const HOST = process.env.NEXT_PUBLIC_PLAUSIBLE_HOST ?? "https://plausible.io";

// Extend Window with plausible queue
declare global {
  interface Window {
    plausible?: (
      event: string,
      options?: { props?: Record<string, string | number | boolean> },
    ) => void;
  }
}

/**
 * Fire a custom Plausible event from client components.
 *
 * Safe to call even when analytics is not loaded — silently no-ops.
 */
export function trackEvent(
  name: string,
  props?: Record<string, string | number | boolean>,
): void {
  if (typeof window !== "undefined" && window.plausible) {
    window.plausible(name, props ? { props } : undefined);
  }
}

export default function Analytics() {
  if (!DOMAIN) return null;

  const scriptSrc = `${HOST}/js/script.js`;

  return (
    <Script
      defer
      data-domain={DOMAIN}
      src={scriptSrc}
      strategy="afterInteractive"
      // Initialise the plausible command queue before the script loads
      onLoad={() => {
        if (!window.plausible) {
          const queue: unknown[][] = [];
          window.plausible = function (
            event: string,
            options?: { props?: Record<string, string | number | boolean> },
          ) {
            queue.push([event, options]);
          };
          (window.plausible as unknown as { q: unknown[][] }).q = queue;
        }
      }}
    />
  );
}
