/**
 * GET  /api/admin/credentials             — list dealer credentials
 * POST /api/admin/credentials             — add or replace a credential
 *
 * Tenant-scoped via `auth.user.dealer_id` (NEVER taken from the request
 * body — see `.ai/conventions.md`). Plaintext credentials are encrypted
 * before they ever hit Postgres via src/lib/external-credentials/crypto-vault.
 *
 * Shadow-mode (no DATABASE_URL): GET returns an empty list with
 * `noData: true`; POST returns the synthetic record so the UI can render
 * a happy-path during local development. Every mutating call emits a
 * typed analytics event and writes to `audit_log` via the lib.
 */

import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated, requireAuth } from "@/lib/auth-guard";
import {
  ALL_PROVIDERS,
  addCredential,
  listCredentials,
  type ExternalProvider,
} from "@/lib/external-credentials/index";
import { CredentialVaultError } from "@/lib/external-credentials/crypto-vault";

/* ------------------------------------------------------------------ */
/*  GET                                                                */
/* ------------------------------------------------------------------ */

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (!isAuthenticated(auth)) return auth;

  const dealerId = auth.user.dealer_id;
  const url = new URL(req.url);
  const providerParam = url.searchParams.get("provider") || undefined;
  const includeRevoked = url.searchParams.get("include_revoked") === "true";

  if (providerParam && !ALL_PROVIDERS.includes(providerParam as ExternalProvider)) {
    return NextResponse.json(
      { error: "Unknown provider", allowed: ALL_PROVIDERS },
      { status: 400 },
    );
  }

  try {
    const credentials = await listCredentials(dealerId, {
      provider: providerParam as ExternalProvider | undefined,
      includeRevoked,
    });
    return NextResponse.json({
      credentials,
      noData: credentials.length === 0,
      noDataReason: credentials.length === 0
        ? (process.env.DATABASE_URL ? "no_credentials" : "database_unavailable")
        : null,
    });
  } catch (err) {
    console.error("[GET /admin/credentials] failed:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

/* ------------------------------------------------------------------ */
/*  POST                                                               */
/* ------------------------------------------------------------------ */

interface AddBody {
  provider?: string;
  label?: string | null;
  plaintext?: string;
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (!isAuthenticated(auth)) return auth;

  const dealerId = auth.user.dealer_id;

  let body: AddBody;
  try {
    body = (await req.json()) as AddBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.provider || !ALL_PROVIDERS.includes(body.provider as ExternalProvider)) {
    return NextResponse.json(
      { error: "Unknown provider", allowed: ALL_PROVIDERS },
      { status: 400 },
    );
  }
  if (typeof body.plaintext !== "string" || body.plaintext.length === 0) {
    return NextResponse.json(
      { error: "plaintext credential is required" },
      { status: 400 },
    );
  }
  // Sanity-cap so a misbehaving client can't blow up the column.
  if (body.plaintext.length > 16_384) {
    return NextResponse.json(
      { error: "plaintext credential too large (>16KB)" },
      { status: 400 },
    );
  }
  if (body.label && typeof body.label !== "string") {
    return NextResponse.json(
      { error: "label must be a string when provided" },
      { status: 400 },
    );
  }

  try {
    const record = await addCredential({
      dealerId,
      provider: body.provider as ExternalProvider,
      label: body.label ?? null,
      plaintext: body.plaintext,
      actorUserId: auth.user.id,
    });
    return NextResponse.json({ credential: record, success: true }, { status: 200 });
  } catch (err) {
    if (err instanceof CredentialVaultError) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: 400 },
      );
    }
    console.error("[POST /admin/credentials] failed:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
