/**
 * POST   /api/admin/dms-adapters/[provider]    upsert credentials
 * PATCH  /api/admin/dms-adapters/[provider]    rotate credentials
 * DELETE /api/admin/dms-adapters/[provider]    soft-revoke (status='revoked')
 *
 * Dealer-admin only. The route resolves the caller's dealer from the
 * session (never from request body) so cross-tenant writes are impossible.
 * All three verbs go through `src/lib/dms-adapters/adapter-registry.ts`
 * which fires audit_log + dms_adapter.* analytics events on every write.
 *
 * Mock provider is allowed (it's the demo-data path); real-provider rows
 * accept a `credentials` JSON payload that is AES-256-GCM-encrypted at the
 * library boundary and never logged in plaintext.
 *
 * Request shapes:
 *   POST   { credentials: { ... } | null }
 *   PATCH  { credentials: { ... } }
 *   DELETE no body
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isAuthenticated, requireAuth } from "@/lib/auth-guard";
import {
  ALL_ADAPTER_PROVIDERS,
  configureAdapter,
  deleteAdapter,
  revokeAdapter,
  rotateAdapterCredentials,
  type DMSAdapterProvider,
} from "@/lib/dms-adapters";

const ProviderParam = z.enum(ALL_ADAPTER_PROVIDERS as [string, ...string[]]);
const ConfigureBody = z.object({
  credentials: z.record(z.string(), z.unknown()).nullable().optional(),
});
const RotateBody = z.object({
  credentials: z.record(z.string(), z.unknown()),
});

interface RouteContext {
  params: Promise<{ provider: string }>;
}

async function resolveProvider(
  ctx: RouteContext,
): Promise<DMSAdapterProvider | NextResponse> {
  const { provider } = await ctx.params;
  const parsed = ProviderParam.safeParse(provider);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "invalid provider",
        valid_providers: ALL_ADAPTER_PROVIDERS,
      },
      { status: 400 },
    );
  }
  return parsed.data as DMSAdapterProvider;
}

async function requireDealerAdmin(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!isAuthenticated(auth)) return auth;
  if (auth.user.role !== "owner" && auth.user.role !== "admin") {
    return NextResponse.json(
      { error: "Insufficient permissions — dealer-admin required" },
      { status: 403 },
    );
  }
  return auth;
}

export async function POST(request: NextRequest, ctx: RouteContext) {
  const providerOrErr = await resolveProvider(ctx);
  if (providerOrErr instanceof NextResponse) return providerOrErr;

  const auth = await requireDealerAdmin(request);
  if (auth instanceof NextResponse) return auth;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const parsed = ConfigureBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid body", detail: parsed.error.message },
      { status: 400 },
    );
  }

  const record = await configureAdapter({
    dealerId: auth.user.dealer_id,
    provider: providerOrErr,
    plaintextCredentials: parsed.data.credentials ?? undefined,
    actorUserId: auth.user.id,
  });
  return NextResponse.json({ adapter: record }, { status: 200 });
}

export async function PATCH(request: NextRequest, ctx: RouteContext) {
  const providerOrErr = await resolveProvider(ctx);
  if (providerOrErr instanceof NextResponse) return providerOrErr;

  const auth = await requireDealerAdmin(request);
  if (auth instanceof NextResponse) return auth;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "credentials body required" },
      { status: 400 },
    );
  }
  const parsed = RotateBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid body", detail: parsed.error.message },
      { status: 400 },
    );
  }

  const record = await rotateAdapterCredentials({
    dealerId: auth.user.dealer_id,
    provider: providerOrErr,
    newPlaintextCredentials: parsed.data.credentials,
    actorUserId: auth.user.id,
  });
  if (!record) {
    return NextResponse.json(
      { error: "no adapter row to rotate — configure first" },
      { status: 404 },
    );
  }
  return NextResponse.json({ adapter: record });
}

export async function DELETE(request: NextRequest, ctx: RouteContext) {
  const providerOrErr = await resolveProvider(ctx);
  if (providerOrErr instanceof NextResponse) return providerOrErr;

  const auth = await requireDealerAdmin(request);
  if (auth instanceof NextResponse) return auth;

  const hard = request.nextUrl.searchParams.get("hard") === "true";

  if (hard) {
    const ok = await deleteAdapter(
      auth.user.dealer_id,
      providerOrErr,
      auth.user.id,
    );
    if (!ok) {
      return NextResponse.json({ error: "no adapter row to delete" }, { status: 404 });
    }
    return NextResponse.json({ deleted: true, provider: providerOrErr });
  }

  const record = await revokeAdapter(
    auth.user.dealer_id,
    providerOrErr,
    auth.user.id,
  );
  if (!record) {
    return NextResponse.json(
      { error: "no active adapter row to revoke" },
      { status: 404 },
    );
  }
  return NextResponse.json({ adapter: record });
}
