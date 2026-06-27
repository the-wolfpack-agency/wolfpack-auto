/**
 * PATCH  /api/admin/credentials/[id]  — rotate the stored plaintext
 * DELETE /api/admin/credentials/[id]  — soft-revoke (keep audit trail)
 *                                       — accept ?hard=true to fully delete
 *
 * Tenant-scoped via session dealer_id. The credential id must belong to
 * the calling dealer; cross-dealer attempts return 404 (we don't leak the
 * existence of credentials we cannot see).
 */

import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated, requireAuth } from "@/lib/auth-guard";
import {
  deleteCredential,
  revokeCredential,
  rotateCredential,
} from "@/lib/external-credentials/index";
import { CredentialVaultError } from "@/lib/external-credentials/crypto-vault";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/* ------------------------------------------------------------------ */
/*  PATCH — rotate                                                      */
/* ------------------------------------------------------------------ */

interface PatchBody {
  plaintext?: string;
}

export async function PATCH(req: NextRequest, ctx: RouteContext) {
  const auth = await requireAuth(req);
  if (!isAuthenticated(auth)) return auth;

  if (!process.env.DATABASE_URL) {
    // Shadow mode (no database): degrade gracefully instead of crashing.
    return NextResponse.json(
      { error: "service_unavailable", shadow: true },
      { status: 503 },
    );
  }

  const { id } = await ctx.params;
  if (!id || !isUuid(id)) {
    return NextResponse.json({ error: "Invalid credential id" }, { status: 400 });
  }

  let body: PatchBody;
  try {
    body = (await req.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (typeof body.plaintext !== "string" || body.plaintext.length === 0) {
    return NextResponse.json(
      { error: "plaintext credential is required" },
      { status: 400 },
    );
  }
  if (body.plaintext.length > 16_384) {
    return NextResponse.json(
      { error: "plaintext credential too large (>16KB)" },
      { status: 400 },
    );
  }

  try {
    const record = await rotateCredential({
      dealerId: auth.user.dealer_id,
      credentialId: id,
      newPlaintext: body.plaintext,
      actorUserId: auth.user.id,
    });
    if (!record) {
      return NextResponse.json({ error: "Credential not found" }, { status: 404 });
    }
    return NextResponse.json({ credential: record, success: true });
  } catch (err) {
    if (err instanceof CredentialVaultError) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: 400 },
      );
    }
    console.error("[PATCH /admin/credentials/[id]] failed:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

/* ------------------------------------------------------------------ */
/*  DELETE — revoke (soft) or hard delete                              */
/* ------------------------------------------------------------------ */

export async function DELETE(req: NextRequest, ctx: RouteContext) {
  const auth = await requireAuth(req);
  if (!isAuthenticated(auth)) return auth;

  if (!process.env.DATABASE_URL) {
    // Shadow mode (no database): degrade gracefully instead of crashing.
    return NextResponse.json(
      { error: "service_unavailable", shadow: true },
      { status: 503 },
    );
  }

  const { id } = await ctx.params;
  if (!id || !isUuid(id)) {
    return NextResponse.json({ error: "Invalid credential id" }, { status: 400 });
  }

  const url = new URL(req.url);
  const hard = url.searchParams.get("hard") === "true";

  try {
    if (hard) {
      const ok = await deleteCredential(auth.user.dealer_id, id, auth.user.id);
      if (!ok) {
        return NextResponse.json({ error: "Credential not found" }, { status: 404 });
      }
      return NextResponse.json({ success: true, deleted: true });
    }
    const record = await revokeCredential(auth.user.dealer_id, id, auth.user.id);
    if (!record) {
      return NextResponse.json({ error: "Credential not found" }, { status: 404 });
    }
    return NextResponse.json({ credential: record, success: true, revoked: true });
  } catch (err) {
    console.error("[DELETE /admin/credentials/[id]] failed:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

function isUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s) ||
    // shadow-mode ids like "shadow-1234567890"
    /^shadow-\d+$/i.test(s);
}
