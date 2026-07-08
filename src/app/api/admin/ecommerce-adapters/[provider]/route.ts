/**
 * POST   /api/admin/ecommerce-adapters/[provider]    upsert credentials
 * PATCH  /api/admin/ecommerce-adapters/[provider]    rotate credentials
 * DELETE /api/admin/ecommerce-adapters/[provider]    soft-revoke (status='revoked')
 *
 * Year-2 retail-vertical foundation per
 * `docs/wolfpack-platform-multivertical-2026-05-12.md`. Mirrors
 * `src/app/api/admin/dms-adapters/[provider]/route.ts` — same shape,
 * e-commerce providers instead of DMS providers, tenant-scoped instead of
 * dealer-scoped.
 *
 * Tenant-admin only. The route resolves the caller's tenant from the
 * session (never from request body) so cross-tenant writes are impossible.
 * All three verbs go through
 * `src/lib/ecommerce-adapters/adapter-registry.ts` which fires audit_log +
 * ecommerce_adapter.* analytics events on every write.
 *
 * mock_shop provider is allowed (it's the demo-data path); real-provider
 * rows accept a `credentials` JSON payload that is AES-256-GCM-encrypted
 * at the library boundary and never logged in plaintext.
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
  ALL_ECOMMERCE_ADAPTER_PROVIDERS,
  configureEcommerceAdapter,
  deleteEcommerceAdapter,
  revokeEcommerceAdapter,
  rotateEcommerceAdapterCredentials,
  type EcommerceAdapterProvider,
} from "@/lib/ecommerce-adapters";

const ProviderParam = z.enum(
  ALL_ECOMMERCE_ADAPTER_PROVIDERS as [string, ...string[]],
);
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
): Promise<EcommerceAdapterProvider | NextResponse> {
  const { provider } = await ctx.params;
  const parsed = ProviderParam.safeParse(provider);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "invalid provider",
        valid_providers: ALL_ECOMMERCE_ADAPTER_PROVIDERS,
      },
      { status: 400 },
    );
  }
  return parsed.data as EcommerceAdapterProvider;
}

async function requireTenantAdmin(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!isAuthenticated(auth)) return auth;
  if (auth.user.role !== "owner" && auth.user.role !== "admin") {
    return NextResponse.json(
      { error: "Insufficient permissions — tenant-admin required" },
      { status: 403 },
    );
  }
  return auth;
}

export async function POST(request: NextRequest, ctx: RouteContext) {
  const providerOrErr = await resolveProvider(ctx);
  if (providerOrErr instanceof NextResponse) return providerOrErr;

  const auth = await requireTenantAdmin(request);
  if (auth instanceof NextResponse) return auth;

  // Shadow mode (no DATABASE_URL) degrades only the persistence layer:
  // `configureEcommerceAdapter` returns a synthesized record and still fires
  // its audit-log + analytics event, so the contract is preserved offline.
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

  const record = await configureEcommerceAdapter({
    tenantId: auth.user.dealer_id,
    provider: providerOrErr,
    plaintextCredentials: parsed.data.credentials ?? undefined,
    actorUserId: auth.user.id,
  });
  return NextResponse.json({ adapter: record }, { status: 200 });
}

export async function PATCH(request: NextRequest, ctx: RouteContext) {
  const providerOrErr = await resolveProvider(ctx);
  if (providerOrErr instanceof NextResponse) return providerOrErr;

  const auth = await requireTenantAdmin(request);
  if (auth instanceof NextResponse) return auth;

  // Shadow mode (no DATABASE_URL): `rotateEcommerceAdapterCredentials`
  // returns null (there is no persisted row to rotate), which the handler
  // maps to a 404 below — the same status a real empty DB would yield.
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

  const record = await rotateEcommerceAdapterCredentials({
    tenantId: auth.user.dealer_id,
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

  const auth = await requireTenantAdmin(request);
  if (auth instanceof NextResponse) return auth;

  // Shadow mode (no DATABASE_URL): revoke/delete return null/false (no
  // persisted row), which the handler maps to a 404 below.
  const hard = request.nextUrl.searchParams.get("hard") === "true";

  if (hard) {
    const ok = await deleteEcommerceAdapter(
      auth.user.dealer_id,
      providerOrErr,
      auth.user.id,
    );
    if (!ok) {
      return NextResponse.json({ error: "no adapter row to delete" }, { status: 404 });
    }
    return NextResponse.json({ deleted: true, provider: providerOrErr });
  }

  const record = await revokeEcommerceAdapter(
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
