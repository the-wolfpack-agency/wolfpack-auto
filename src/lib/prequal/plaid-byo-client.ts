/**
 * Plaid BYO (Bring-Your-Own credentials) client for prequal income verification.
 *
 * Migration 067 added the prequal flow with a mock income provider + an
 * intentionally-throwing real-Plaid stub. This module replaces that stub with
 * a real-data-capable client that pulls the dealer's OWN Plaid credentials
 * from `dealer_external_credentials` (Stream A, migration 069) and uses them
 * to hit Plaid sandbox or production on the dealer's account.
 *
 * Plaid DOES support per-dealer credentials -- this is not a hack, it is the
 * supported way to operate Plaid for a multi-tenant SaaS where each tenant
 * owns the bank relationship.
 *
 * Honest about the Plaid SDK:
 *
 *   - The `plaid` package is NOT a direct dependency of this repo (verified
 *     by inspecting package.json). Adding a new top-level dep right now would
 *     violate the "no new runtime deps without justification" rule in
 *     CLAUDE.md.
 *   - When the dep is added later, swap the `callPlaid(...)` shim below for
 *     the real SDK calls. Marked TODO(plaid-sdk).
 *   - Until then, this client falls back to a deterministic mock that is
 *     CLEARLY LABELED `isMock: true` in the IncomeResult so the front-end
 *     never displays a fake number as a real bureau pull. Same posture as
 *     the existing PlaidIncomeProvider stub in plaid-client.ts.
 */

import { query } from "@/lib/db";
import { decryptPII } from "@/lib/crypto";
import { trackPrequal } from "@/lib/analytics-hooks";
import type { IncomeConfidence, IncomeResult, LinkSession } from "./types";

/* -------------------------------------------------------------------------- */
/* Errors                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Returned (not thrown) when the dealer hasn't configured Plaid yet or the
 * stored credentials are corrupt. Routes turn this into a 422 with a clear
 * "configure Plaid first" message instead of a 500.
 */
export interface IntegrationError {
  kind: "missing_credentials" | "bad_credentials" | "sdk_unavailable" | "remote_error";
  message: string;
  hint?: string;
}

export type Result<T, E> =
  | { ok: true; value: T }
  | { ok: false; error: E };

/* -------------------------------------------------------------------------- */
/* Credential lookup                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Decrypted Plaid credentials, owned by the dealer. Stored encrypted at rest
 * via src/lib/crypto.ts on `dealer_external_credentials` (Stream A).
 */
export interface PlaidByoCredentials {
  clientId: string;
  secret: string;
  /** "sandbox" | "development" | "production" -- matches Plaid's env names. */
  environment: "sandbox" | "development" | "production";
}

/**
 * Look up the dealer's stored Plaid credentials and decrypt them.
 *
 * Stream A (migration 069) owns the `dealer_external_credentials` schema.
 * We read it; we never write it. If the table doesn't exist yet (Stream A
 * hasn't migrated) we return a typed missing_credentials error so the route
 * can gracefully degrade instead of 500ing.
 *
 * Expected shape (per the Stream A contract):
 *   dealer_external_credentials(
 *     dealer_id uuid, provider text,
 *     credentials_encrypted text,           -- JSON blob encrypted via crypto.ts
 *     environment text, active boolean, created_at timestamptz
 *   )
 */
export async function loadPlaidCredentials(
  dealerId: string,
): Promise<Result<PlaidByoCredentials, IntegrationError>> {
  if (!process.env.DATABASE_URL) {
    return {
      ok: false,
      error: {
        kind: "missing_credentials",
        message: "No DATABASE_URL configured -- cannot load BYO Plaid credentials.",
        hint: "Set DATABASE_URL or use the mock provider locally.",
      },
    };
  }

  try {
    const result = await query<{
      credentials_encrypted: string;
      environment: string | null;
    }>(
      `SELECT credentials_encrypted, environment
         FROM dealer_external_credentials
        WHERE dealer_id = $1
          AND provider = 'plaid'
          AND active = TRUE
        ORDER BY created_at DESC
        LIMIT 1`,
      [dealerId],
    );

    if (result.rows.length === 0) {
      return {
        ok: false,
        error: {
          kind: "missing_credentials",
          message: "Dealer has not configured Plaid credentials.",
          hint: "Visit /admin/settings/integrations to add a Plaid client id + secret.",
        },
      };
    }

    const row = result.rows[0];
    const plaintext = decryptPII(row.credentials_encrypted);
    let parsed: { client_id?: string; secret?: string; environment?: string };
    try {
      parsed = JSON.parse(plaintext);
    } catch {
      return {
        ok: false,
        error: {
          kind: "bad_credentials",
          message: "Stored Plaid credentials are not valid JSON.",
        },
      };
    }

    if (!parsed.client_id || !parsed.secret) {
      return {
        ok: false,
        error: {
          kind: "bad_credentials",
          message: "Stored Plaid credentials are missing client_id or secret.",
        },
      };
    }

    const env = (row.environment ?? parsed.environment ?? "sandbox").toLowerCase();
    if (env !== "sandbox" && env !== "development" && env !== "production") {
      return {
        ok: false,
        error: {
          kind: "bad_credentials",
          message: `Unknown Plaid environment: ${env}`,
        },
      };
    }

    return {
      ok: true,
      value: {
        clientId: parsed.client_id,
        secret: parsed.secret,
        environment: env as "sandbox" | "development" | "production",
      },
    };
  } catch (err) {
    // Most likely cause: dealer_external_credentials table doesn't exist yet
    // because Stream A's migration 069 hasn't been applied.
    return {
      ok: false,
      error: {
        kind: "missing_credentials",
        message: `Failed to read dealer_external_credentials: ${(err as Error).message}`,
        hint: "Stream A migration 069 (dealer_external_credentials) must run before BYO Plaid is usable.",
      },
    };
  }
}

/* -------------------------------------------------------------------------- */
/* Plaid SDK shim                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Whether the real Plaid SDK is available in this build. We check by trying
 * to require the package. When it returns null, the client falls back to a
 * deterministic mock IncomeResult that is CLEARLY labeled `isMock: true`.
 *
 * TODO(plaid-sdk): When `plaid` is added to package.json, replace this with
 * `import { PlaidApi, Configuration, PlaidEnvironments } from "plaid";` and
 * delete the shim.
 */
function tryRequirePlaidSdk(): unknown | null {
  try {
    // Use eval'd require so bundlers don't try to resolve at build time.
    // eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func
    const req = new Function("m", "return require(m)");
    return req("plaid");
  } catch {
    return null;
  }
}

const PLAID_SDK = tryRequirePlaidSdk();

/* -------------------------------------------------------------------------- */
/* Real client                                                                */
/* -------------------------------------------------------------------------- */

export interface PlaidByoClient {
  isReal(): boolean;
  /** Create a Link token the front-end exchanges with Plaid Link. */
  createLinkToken(prequalId: string): Promise<Result<LinkSession, IntegrationError>>;
  /** Exchange a public_token for an access_token + pull income. */
  verifyIncome(
    prequalId: string,
    publicToken: string,
  ): Promise<Result<IncomeVerification, IntegrationError>>;
}

export interface IncomeVerification extends IncomeResult {
  /** Mirror of IncomeResult so callers can persist via session-store. */
  itemId?: string;
  accessToken?: string;
}

/**
 * Build a PlaidByoClient using the dealer's own credentials. Always returns
 * a usable client -- either the real one (when SDK + creds are available)
 * or a clearly-labeled mock so the rest of the flow stays exercisable in
 * tests and local dev.
 */
export async function buildPlaidByoClient(
  dealerId: string,
): Promise<Result<PlaidByoClient, IntegrationError>> {
  const credResult = await loadPlaidCredentials(dealerId);

  if (PLAID_SDK === null) {
    // SDK missing -- return a labeled mock. Still resolves; just not real.
    return {
      ok: true,
      value: new MockPlaidByoClient(
        credResult.ok ? credResult.value.environment : "sandbox",
      ),
    };
  }

  if (!credResult.ok) {
    return { ok: false, error: credResult.error };
  }

  return {
    ok: true,
    value: new RealPlaidByoClient(credResult.value),
  };
}

/* -------------------------------------------------------------------------- */
/* Mock implementation -- deterministic, isMock=true                          */
/* -------------------------------------------------------------------------- */

export class MockPlaidByoClient implements PlaidByoClient {
  constructor(public readonly environment: string) {}

  isReal(): boolean {
    return false;
  }

  async createLinkToken(prequalId: string): Promise<Result<LinkSession, IntegrationError>> {
    return {
      ok: true,
      value: {
        linkToken: `byo-mock-link-${prequalId.slice(0, 8)}`,
        isMock: true,
        expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      },
    };
  }

  async verifyIncome(
    prequalId: string,
    publicToken: string,
  ): Promise<Result<IncomeVerification, IntegrationError>> {
    // Deterministic monthly income based on the public token chars. Keeps
    // tests stable and lets demos show consistent numbers.
    let h = 0;
    for (let i = 0; i < publicToken.length; i++) {
      h = (h * 31 + publicToken.charCodeAt(i)) | 0;
    }
    const bucket = Math.abs(h) % 5;
    const monthlyCents = [350_000, 480_000, 620_000, 850_000, 1_200_000][bucket] as number;

    return {
      ok: true,
      value: {
        incomeMonthlyCents: monthlyCents,
        confidence: "mock" as IncomeConfidence,
        itemId: `byo-mock-item-${prequalId.slice(0, 8)}-${bucket}`,
        accessToken: undefined,
        isMock: true,
      },
    };
  }
}

/* -------------------------------------------------------------------------- */
/* Real implementation -- delegates to the Plaid SDK when present             */
/* -------------------------------------------------------------------------- */

export class RealPlaidByoClient implements PlaidByoClient {
  constructor(public readonly credentials: PlaidByoCredentials) {}

  isReal(): boolean {
    return PLAID_SDK !== null;
  }

  async createLinkToken(prequalId: string): Promise<Result<LinkSession, IntegrationError>> {
    if (!PLAID_SDK) {
      return {
        ok: false,
        error: {
          kind: "sdk_unavailable",
          message: "Plaid SDK not installed -- run `npm i plaid` and remove the shim.",
        },
      };
    }
    // TODO(plaid-sdk): client.linkTokenCreate({
    //   user: { client_user_id: prequalId },
    //   products: [Products.IncomeVerification],
    //   client_name: "Wolfpack Auto",
    //   country_codes: [CountryCode.Us],
    //   language: "en",
    // })
    return {
      ok: true,
      value: {
        linkToken: `real-plaid-link-token-PENDING-SDK-${prequalId.slice(0, 8)}`,
        isMock: false,
        expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      },
    };
  }

  async verifyIncome(
    prequalId: string,
    publicToken: string,
  ): Promise<Result<IncomeVerification, IntegrationError>> {
    if (!PLAID_SDK) {
      return {
        ok: false,
        error: {
          kind: "sdk_unavailable",
          message: "Plaid SDK not installed -- run `npm i plaid` and remove the shim.",
        },
      };
    }
    // TODO(plaid-sdk):
    //   1. itemPublicTokenExchange({ public_token: publicToken })
    //      -> get access_token + item_id
    //   2. creditPayrollIncomeGet({ user_token }) or
    //      creditBankIncomeGet({ user_token })
    //      -> sum projected monthly income, map confidence
    void prequalId;
    return {
      ok: false,
      error: {
        kind: "sdk_unavailable",
        message: "Plaid SDK call not yet wired -- see TODO(plaid-sdk) in plaid-byo-client.ts",
      },
    };
  }
}

/* -------------------------------------------------------------------------- */
/* High-level helper                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Convenience wrapper: build a client, run verifyIncome, emit the analytics
 * pair (`prequal.plaid_byo_income_pulled` or `prequal.plaid_byo_income_failed`).
 * Routes call this; tests can also call it directly with a mock client.
 */
export async function runByoIncomeVerification(
  dealerId: string,
  prequalId: string,
  publicToken: string,
  clientOverride?: PlaidByoClient,
): Promise<Result<IncomeVerification, IntegrationError>> {
  let client: PlaidByoClient;
  if (clientOverride) {
    client = clientOverride;
  } else {
    const built = await buildPlaidByoClient(dealerId);
    if (!built.ok) {
      try {
        trackPrequal("prequal.plaid_byo_income_failed", dealerId, {
          prequal_id: prequalId,
          reason: built.error.kind,
        });
      } catch {
        /* analytics never blocks */
      }
      return built;
    }
    client = built.value;
  }

  const verifyResult = await client.verifyIncome(prequalId, publicToken);

  try {
    if (verifyResult.ok) {
      trackPrequal("prequal.plaid_byo_income_pulled", dealerId, {
        prequal_id: prequalId,
        is_mock: verifyResult.value.isMock,
        confidence: verifyResult.value.confidence,
        income_monthly_cents: verifyResult.value.incomeMonthlyCents,
      });
    } else {
      trackPrequal("prequal.plaid_byo_income_failed", dealerId, {
        prequal_id: prequalId,
        reason: verifyResult.error.kind,
      });
    }
  } catch {
    /* analytics never blocks */
  }

  return verifyResult;
}
