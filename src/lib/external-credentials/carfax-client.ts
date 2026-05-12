/**
 * Carfax-for-Dealers BYO client.
 *
 * Carfax DOES issue per-dealer credentials (Carfax for Dealers API). The
 * wire format is dealer-specific and gated behind the dealer's signed
 * subscription. Until we have a confirmed customer in the program we
 * cannot know the precise live JSON shape. Rather than fabricate a fake
 * shape, this file:
 *
 *   1. Declares the credential payload we accept (TODO(byo-shape) below).
 *   2. Declares the canonical normalized return shape consumers depend on.
 *   3. Implements a graceful-degradation `getCarfaxReport()` that returns
 *      a typed `unavailable` Result when no credential is stored — the
 *      route surfaces this as 200 `{ available: false, reason: 'no_credential' }`.
 *   4. Implements the actual HTTP call behind a TODO(byo-shape) block; if
 *      a real dealer's credential lands in `dealer_external_credentials`,
 *      the call structure (auth header, timeout, error mapping) is in
 *      place — only the JSON parsing changes once we learn the live shape.
 *
 * This honors the "don't pretend you know the wire format if you don't"
 * guidance in the Stream A task brief.
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

const CARFAX_FETCH_TIMEOUT_MS = 10_000;
const CARFAX_REPORT_CACHE_TTL_SECONDS = 60 * 60 * 24 * 7; // 7d per VIN

/**
 * TODO(byo-shape): The Carfax-for-Dealers credential payload is currently
 * documented as { apiKey, dealerCode } via partner outreach but has not
 * been verified against a live subscription. Update once we have a
 * confirmed dealer.
 */
export interface CarfaxCredentialShape {
  apiKey: string;
  /** Carfax-issued dealer code; required on every report request. */
  dealerCode: string;
}

/**
 * Canonical normalized Carfax report shape we surface to the UI. Map any
 * real Carfax wire format into this on the way out so the rest of the
 * codebase never depends on a partner-specific shape.
 */
export interface CarfaxReport {
  vin: string;
  reportUrl?: string;
  ownerCount?: number;
  accidentCount?: number;
  serviceRecordCount?: number;
  hasOpenRecall?: boolean;
  titleBrandings?: string[];
  estimatedMileage?: number;
  /** Free-form "what the Carfax record says about this VIN" message. */
  summary?: string;
  fetchedAt: string;
  isMock: boolean;
  providerLabel: string;
}

export interface GetCarfaxReportArgs {
  dealerId: string;
  vin: string;
}

/**
 * Fetch a Carfax-for-Dealers report for a VIN using the dealer's BYO
 * credential. Returns `{ ok: false, error: { code: 'upstream_unavailable' } }`
 * when no credential is stored — the route translates that into a 200
 * `{ available: false, reason: 'no_credential' }` per the Stream A brief.
 */
export async function getCarfaxReport(
  args: GetCarfaxReportArgs,
): Promise<Result<CarfaxReport, IntegrationError>> {
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

  const cred = await loadCredential(dealerId, "carfax", null, { markUsed: true });
  if (!cred) {
    return {
      ok: false,
      error: {
        code: "upstream_unavailable",
        message: "no_credential",
      },
    };
  }

  let parsed: CarfaxCredentialShape;
  try {
    parsed = JSON.parse(cred.plaintext) as CarfaxCredentialShape;
  } catch {
    // Plaintext might be a raw API key string. Accept that shape too —
    // dealer can paste the key without our exact JSON envelope.
    parsed = { apiKey: cred.plaintext, dealerCode: "" };
  }

  if (!parsed.apiKey) {
    await recordCredentialError(dealerId, cred.record.id, "missing apiKey");
    return {
      ok: false,
      error: { code: "invalid_input", message: "credential missing apiKey" },
    };
  }

  if (process.env.CARFAX_DISABLE_NETWORK === "true") {
    const synthetic = syntheticReport(cleanVin);
    trackInventoryMarketIntel(
      "carfax.report_fetched",
      dealerId,
      { vin: cleanVin, is_mock: true, cached: false },
    );
    trackCredentials("credentials.byo_proxy_call_succeeded", dealerId, {
      provider: "carfax",
      vin: cleanVin,
    });
    return { ok: true, value: synthetic };
  }

  // TODO(byo-shape): real Carfax-for-Dealers endpoint + response JSON are
  // not yet verified against a live subscription. The structure below is
  // our best understanding from partner-portal documentation. When a real
  // dealer provides a credential and the first 4xx/5xx hits this path,
  // update the URL + response normalization here. The credential-error
  // recording, timeout, and analytics emission are correct regardless of
  // the eventual shape.
  const base = process.env.CARFAX_API_BASE ?? "https://api.carfax.com/v1";
  const url = `${base}/reports/${encodeURIComponent(cleanVin)}`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${parsed.apiKey}`,
        "X-Carfax-Dealer-Code": parsed.dealerCode || "",
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(CARFAX_FETCH_TIMEOUT_MS),
    });
  } catch (err) {
    const msg = (err as Error).message ?? "fetch threw";
    const code = /abort|timeout/i.test(msg) ? "timeout" : "network";
    await recordCredentialError(dealerId, cred.record.id, msg);
    trackCredentials("credentials.byo_proxy_call_failed", dealerId, {
      provider: "carfax",
      vin: cleanVin,
      reason: code,
    });
    return { ok: false, error: { code, message: msg } };
  }

  if (response.status === 401 || response.status === 403) {
    await recordCredentialError(
      dealerId,
      cred.record.id,
      `Carfax rejected credential (HTTP ${response.status})`,
    );
    trackCredentials("credentials.byo_proxy_call_failed", dealerId, {
      provider: "carfax",
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
      error: { code: "not_found", message: "Carfax has no report for VIN", status: 404 },
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
        message: `Carfax HTTP ${response.status}`,
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

  // TODO(byo-shape): Normalize the real Carfax response once we observe a
  // live payload. Fields below are best-effort guesses; defaults keep the
  // shape stable.
  const value: CarfaxReport = {
    vin: cleanVin,
    reportUrl: typeof raw.reportUrl === "string" ? raw.reportUrl : undefined,
    ownerCount: typeof raw.owners === "number" ? (raw.owners as number) : undefined,
    accidentCount: typeof raw.accidents === "number" ? (raw.accidents as number) : undefined,
    serviceRecordCount: typeof raw.serviceRecords === "number" ? (raw.serviceRecords as number) : undefined,
    hasOpenRecall: typeof raw.hasOpenRecall === "boolean" ? (raw.hasOpenRecall as boolean) : undefined,
    titleBrandings: Array.isArray(raw.titleBrandings) ? (raw.titleBrandings as string[]) : undefined,
    estimatedMileage: typeof raw.estimatedMileage === "number" ? (raw.estimatedMileage as number) : undefined,
    summary: typeof raw.summary === "string" ? (raw.summary as string) : undefined,
    fetchedAt: new Date().toISOString(),
    isMock: false,
    providerLabel: "Carfax for Dealers",
  };

  trackInventoryMarketIntel("carfax.report_fetched", dealerId, {
    vin: cleanVin,
    is_mock: false,
    cached: false,
  });
  trackCredentials("credentials.byo_proxy_call_succeeded", dealerId, {
    provider: "carfax",
    vin: cleanVin,
  });
  return { ok: true, value };
}

function syntheticReport(vin: string): CarfaxReport {
  let hash = 0;
  for (let i = 0; i < vin.length; i++) hash = (hash * 31 + vin.charCodeAt(i)) | 0;
  return {
    vin,
    reportUrl: undefined,
    ownerCount: 1 + Math.abs(hash % 3),
    accidentCount: Math.abs(hash % 2),
    serviceRecordCount: 4 + Math.abs(hash % 12),
    hasOpenRecall: hash % 5 === 0,
    titleBrandings: [],
    estimatedMileage: 20_000 + Math.abs(hash % 100_000),
    summary: "Synthetic Carfax payload (CARFAX_DISABLE_NETWORK=true).",
    fetchedAt: new Date().toISOString(),
    isMock: true,
    providerLabel: "Carfax (synthetic)",
  };
}

export const CARFAX_CACHE_TTL_SECONDS = CARFAX_REPORT_CACHE_TTL_SECONDS;
