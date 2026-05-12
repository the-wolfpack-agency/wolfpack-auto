/**
 * AutoCheck (Experian) BYO client.
 *
 * AutoCheck is the Experian-owned competitor to Carfax. Like Carfax, it
 * issues per-dealer credentials via the AutoCheck Dealer portal; like
 * Carfax, the live wire format is dealer-specific and gated behind a
 * subscription. We do not pretend to know the precise live shape — see
 * TODO(byo-shape) markers below.
 *
 * Same graceful-degradation pattern as carfax-client.ts: if no
 * credential is stored, return `upstream_unavailable` so the route can
 * surface `{ available: false, reason: 'no_credential' }`.
 */

import {
  loadCredential,
  recordCredentialError,
} from "@/lib/external-credentials/index";
import {
  trackCredentials,
  trackInventoryMarketIntel,
} from "@/lib/analytics-hooks";
import type {
  IntegrationError,
  Result,
} from "@/lib/external-credentials/edmunds-client";

const AUTOCHECK_FETCH_TIMEOUT_MS = 10_000;

/**
 * TODO(byo-shape): AutoCheck dealer-portal credentials documented as
 * { username, password, accountId } but not verified against a live
 * subscription. Update once a real dealer's credential is enrolled.
 */
export interface AutoCheckCredentialShape {
  username: string;
  password: string;
  accountId: string;
}

/**
 * Canonical normalized AutoCheck report shape. We expose the AutoCheck
 * "score" (0-100) plus the same set of facts Carfax provides so the UI
 * can compare side-by-side.
 */
export interface AutoCheckReport {
  vin: string;
  /** AutoCheck Score (0-100). Higher = cleaner history. */
  autocheckScore?: number;
  /** Score band the vehicle's segment averages, for context. */
  segmentAverageScoreRange?: [number, number];
  ownerCount?: number;
  accidentCount?: number;
  titleBrandings?: string[];
  estimatedMileage?: number;
  hasOpenRecall?: boolean;
  summary?: string;
  reportUrl?: string;
  fetchedAt: string;
  isMock: boolean;
  providerLabel: string;
}

export interface GetAutoCheckReportArgs {
  dealerId: string;
  vin: string;
}

/**
 * Fetch an AutoCheck report for a VIN using the dealer's BYO credential.
 * Returns `upstream_unavailable` when no credential is stored.
 */
export async function getAutoCheckReport(
  args: GetAutoCheckReportArgs,
): Promise<Result<AutoCheckReport, IntegrationError>> {
  const { dealerId, vin } = args;
  const cleanVin = (vin || "").trim().toUpperCase();
  if (!cleanVin || cleanVin.length !== 17) {
    return {
      ok: false,
      error: {
        code: "invalid_input",
        message: `VIN must be 17 characters; got ${cleanVin.length}`,
      },
    };
  }

  const cred = await loadCredential(dealerId, "autocheck", null, { markUsed: true });
  if (!cred) {
    return {
      ok: false,
      error: { code: "upstream_unavailable", message: "no_credential" },
    };
  }

  let parsed: AutoCheckCredentialShape;
  try {
    parsed = JSON.parse(cred.plaintext) as AutoCheckCredentialShape;
  } catch {
    // Plaintext may be a token instead of a JSON envelope. Accept both.
    parsed = { username: "", password: "", accountId: "" };
  }

  // TODO(byo-shape): AutoCheck's live auth flow may differ — Experian
  // historically issues a session token via a separate /authenticate call
  // before /reports/{vin} is callable. The simpler bearer-token shape
  // below covers the case where the dealer hands us a long-lived token;
  // when we see a live 401 here we update accordingly.
  const token =
    parsed.password && parsed.username
      ? Buffer.from(`${parsed.username}:${parsed.password}`).toString("base64")
      : cred.plaintext;

  if (process.env.AUTOCHECK_DISABLE_NETWORK === "true") {
    const synthetic = syntheticReport(cleanVin);
    trackInventoryMarketIntel("autocheck.report_fetched", dealerId, {
      vin: cleanVin,
      is_mock: true,
      cached: false,
    });
    trackCredentials("credentials.byo_proxy_call_succeeded", dealerId, {
      provider: "autocheck",
      vin: cleanVin,
    });
    return { ok: true, value: synthetic };
  }

  const base = process.env.AUTOCHECK_API_BASE ?? "https://api.autocheck.com/v1";
  const url = `${base}/reports/${encodeURIComponent(cleanVin)}`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Basic ${token}`,
        "X-AutoCheck-Account": parsed.accountId || "",
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(AUTOCHECK_FETCH_TIMEOUT_MS),
    });
  } catch (err) {
    const msg = (err as Error).message ?? "fetch threw";
    const code = /abort|timeout/i.test(msg) ? "timeout" : "network";
    await recordCredentialError(dealerId, cred.record.id, msg);
    trackCredentials("credentials.byo_proxy_call_failed", dealerId, {
      provider: "autocheck",
      vin: cleanVin,
      reason: code,
    });
    return { ok: false, error: { code, message: msg } };
  }

  if (response.status === 401 || response.status === 403) {
    await recordCredentialError(
      dealerId,
      cred.record.id,
      `AutoCheck rejected credential (HTTP ${response.status})`,
    );
    trackCredentials("credentials.byo_proxy_call_failed", dealerId, {
      provider: "autocheck",
      vin: cleanVin,
      reason: "auth",
    });
    return {
      ok: false,
      error: {
        code: "upstream_error",
        message: `auth_failed (${response.status})`,
        status: response.status,
      },
    };
  }
  if (response.status === 404) {
    return {
      ok: false,
      error: { code: "not_found", message: "AutoCheck has no report for VIN", status: 404 },
    };
  }
  if (response.status === 429) {
    return {
      ok: false,
      error: { code: "rate_limited", message: "rate_limited", status: 429 },
    };
  }
  if (!response.ok) {
    return {
      ok: false,
      error: {
        code: response.status >= 500 ? "upstream_unavailable" : "upstream_error",
        message: `AutoCheck HTTP ${response.status}`,
        status: response.status,
      },
    };
  }

  let raw: Record<string, unknown>;
  try {
    raw = (await response.json()) as Record<string, unknown>;
  } catch (err) {
    return {
      ok: false,
      error: { code: "parse_error", message: (err as Error).message },
    };
  }

  // TODO(byo-shape): normalize once we see a live AutoCheck payload.
  const value: AutoCheckReport = {
    vin: cleanVin,
    autocheckScore: typeof raw.score === "number" ? (raw.score as number) : undefined,
    segmentAverageScoreRange:
      Array.isArray(raw.segmentAverageScoreRange) &&
      (raw.segmentAverageScoreRange as unknown[]).length === 2
        ? (raw.segmentAverageScoreRange as [number, number])
        : undefined,
    ownerCount: typeof raw.owners === "number" ? (raw.owners as number) : undefined,
    accidentCount: typeof raw.accidents === "number" ? (raw.accidents as number) : undefined,
    titleBrandings: Array.isArray(raw.titleBrandings) ? (raw.titleBrandings as string[]) : undefined,
    estimatedMileage: typeof raw.estimatedMileage === "number" ? (raw.estimatedMileage as number) : undefined,
    hasOpenRecall: typeof raw.hasOpenRecall === "boolean" ? (raw.hasOpenRecall as boolean) : undefined,
    summary: typeof raw.summary === "string" ? (raw.summary as string) : undefined,
    reportUrl: typeof raw.reportUrl === "string" ? (raw.reportUrl as string) : undefined,
    fetchedAt: new Date().toISOString(),
    isMock: false,
    providerLabel: "AutoCheck (Experian)",
  };

  trackInventoryMarketIntel("autocheck.report_fetched", dealerId, {
    vin: cleanVin,
    is_mock: false,
    cached: false,
  });
  trackCredentials("credentials.byo_proxy_call_succeeded", dealerId, {
    provider: "autocheck",
    vin: cleanVin,
  });

  return { ok: true, value };
}

function syntheticReport(vin: string): AutoCheckReport {
  let hash = 0;
  for (let i = 0; i < vin.length; i++) hash = (hash * 31 + vin.charCodeAt(i)) | 0;
  return {
    vin,
    autocheckScore: 70 + Math.abs(hash % 30),
    segmentAverageScoreRange: [78, 92],
    ownerCount: 1 + Math.abs(hash % 3),
    accidentCount: Math.abs(hash % 2),
    titleBrandings: [],
    estimatedMileage: 20_000 + Math.abs(hash % 100_000),
    hasOpenRecall: hash % 5 === 0,
    summary: "Synthetic AutoCheck payload (AUTOCHECK_DISABLE_NETWORK=true).",
    reportUrl: undefined,
    fetchedAt: new Date().toISOString(),
    isMock: true,
    providerLabel: "AutoCheck (synthetic)",
  };
}
