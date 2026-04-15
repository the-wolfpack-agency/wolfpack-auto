/**
 * Server-side analytics helpers.
 *
 * Sends events to the Plausible API for server-side conversion tracking
 * (e.g. lead submissions from API routes).
 *
 * Requires PLAUSIBLE_API_KEY for authenticated requests.
 * Silently no-ops when env vars are missing.
 */

const DOMAIN = process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN;
const HOST = process.env.NEXT_PUBLIC_PLAUSIBLE_HOST ?? "https://plausible.io";
const API_KEY = process.env.PLAUSIBLE_API_KEY;

/**
 * Track a server-side event via Plausible Events API.
 *
 * @param name  - Event name (e.g. "contact_form_submission")
 * @param props - Optional key-value properties attached to the event
 * @param url   - The page URL where the event conceptually originated
 */
export async function trackServerEvent(
  name: string,
  props?: Record<string, string | number | boolean>,
  url?: string,
): Promise<void> {
  if (!DOMAIN) {
    console.log(`[analytics] Server event "${name}" skipped — no NEXT_PUBLIC_PLAUSIBLE_DOMAIN`);
    return;
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const eventUrl = url ?? siteUrl;

  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "User-Agent": "Wolfpack-Auto-Server/1.0",
    };

    if (API_KEY) {
      headers["Authorization"] = `Bearer ${API_KEY}`;
    }

    const response = await fetch(`${HOST}/api/event`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        domain: DOMAIN,
        name,
        url: eventUrl,
        props: props ?? {},
      }),
    });

    if (!response.ok) {
      console.error(
        `[analytics] Server event "${name}" failed: ${response.status} ${response.statusText}`,
      );
    }
  } catch (err) {
    // Fire-and-forget — never break the request for analytics
    console.error(`[analytics] Server event "${name}" error:`, err);
  }
}

// ---------------------------------------------------------------------------
// Security event helpers
// ---------------------------------------------------------------------------

/**
 * Track a CSP violation report event.
 * Delegates to trackServerEvent (fire-and-forget, never throws).
 */
export async function trackCspViolation(props: {
  blocked_uri: string;
  violated_directive: string;
  source_file: string;
  line_number: number;
}): Promise<void> {
  return trackServerEvent("system.csp_violation_reported", props);
}

/**
 * Track a security posture page view.
 */
export async function trackSecurityPostureViewed(props: {
  user_agent_hash: string;
}): Promise<void> {
  return trackServerEvent("system.security_posture_viewed", props);
}

/**
 * Track TLS hybrid verification result from CI.
 */
export async function trackTlsHybridVerified(props: {
  domain: string;
  result: "pass" | "fail";
}): Promise<void> {
  return trackServerEvent("system.tls_hybrid_verified", props);
}
