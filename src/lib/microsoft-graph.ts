/**
 * Minimal Microsoft Graph app-only token helper for wolfpack-auto.
 *
 * Ported from Wolfpack Instinct / beyond-sku - ONLY the app-only
 * (client-credentials) token path, none of the delegated/OAuth machinery.
 * Used by the mail layer (mail/send-via-graph.ts) to send transactional
 * email from a real M365 mailbox with zero DNS work - Wolfpack already pays
 * for M365, so Mail.Send (Application) + admin consent gives free, branded
 * outbound email with no third-party vendor and no SPF/DKIM dance.
 *
 * Reads MS_CLIENT_ID / MS_CLIENT_SECRET / MS_TENANT_ID from the env (or the
 * equivalent MICROSOFT_* names, so the existing Wolfpack M365 app
 * registration already provisioned for beyond/Instinct can be reused
 * verbatim). The token is cached in-memory with a 60s skew so we don't hit
 * the token endpoint on every send. NEVER throws - returns null when creds
 * are missing, the tenant is "common" (client-credentials needs a real
 * GUID), or the token endpoint rejects the request (e.g. admin consent not
 * yet granted). Callers must treat null as "fall back to a copyable link".
 */

interface AppToken {
  accessToken: string;
  expiresAt: number;
}

let cachedAppToken: AppToken | null = null;

/** Test-only: clear the module-scoped app-only token cache. */
export function _resetAppTokenCacheForTests(): void {
  cachedAppToken = null;
}

/**
 * Acquire (or return a cached) app-only Graph access token via the
 * client-credentials flow. Returns null when MS env vars are missing or the
 * tenant admin hasn't granted application-permission consent yet.
 */
export async function getAppOnlyToken(): Promise<string | null> {
  if (cachedAppToken && cachedAppToken.expiresAt > Date.now() + 60_000) {
    return cachedAppToken.accessToken;
  }

  /* Accept either the MS_* names or Instinct's MICROSOFT_* names for the SAME
     Azure app registration, so the one M365 app + secret already provisioned
     for Wolfpack can be reused verbatim - no duplicate registration, no
     renaming when copying values across Vercel projects. */
  const clientId = process.env.MS_CLIENT_ID ?? process.env.MICROSOFT_CLIENT_ID;
  const clientSecret =
    process.env.MS_CLIENT_SECRET ?? process.env.MICROSOFT_CLIENT_SECRET;
  const tenantId = process.env.MS_TENANT_ID ?? process.env.MICROSOFT_TENANT_ID;
  if (!clientId || !clientSecret || !tenantId) return null;

  /* Tenant must be a real GUID - "common" doesn't accept client-credentials.
     Bail gracefully if it's the multi-tenant placeholder. */
  if (tenantId === "common") return null;

  try {
    const res = await fetch(
      `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          /* App-only tokens always request /.default - Azure issues a token
             containing every APPLICATION permission already granted via admin
             consent. Individual scopes can't be requested here. */
          scope: "https://graph.microsoft.com/.default",
          grant_type: "client_credentials",
        }).toString(),
      },
    );
    if (!res.ok) {
      /* 401 / 403 typically means application-permission consent hasn't been
         granted in Azure yet. Return null so the caller falls back. */
      return null;
    }
    const data = (await res.json().catch(() => ({}))) as {
      access_token?: string;
      expires_in?: number;
    };
    if (!data.access_token) return null;
    const ttlSec = typeof data.expires_in === "number" ? data.expires_in : 3000;
    cachedAppToken = {
      accessToken: data.access_token,
      expiresAt: Date.now() + ttlSec * 1000,
    };
    return cachedAppToken.accessToken;
  } catch {
    return null;
  }
}
