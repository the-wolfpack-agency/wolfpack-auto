/**
 * Admin API — custom domain management for dealers.
 *
 * POST   /api/admin/domains — Register a new custom domain
 * GET    /api/admin/domains?dealerId=<uuid> — List domains for a dealer
 * DELETE /api/admin/domains?domainId=<uuid>&dealerId=<uuid> — Remove a domain
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthenticated } from "@/lib/auth-guard";
import {
  addDomain,
  getDomains,
  removeDomain,
  getDomainById,
  verifyDomain,
  updateSSLStatus,
} from "@/db/queries/domains";
import { invalidateTenantCache } from "@/lib/tenant-resolver";
import { requestCertificate } from "@/lib/ssl";

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Basic domain format validation.
 * Allows subdomains (e.g., "www.example.com") and bare domains ("example.com").
 */
const DOMAIN_RE = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i;

/** Domains that cannot be registered as custom domains. */
const BLOCKED_DOMAINS = new Set([
  "wolfpackauto.com",
  "www.wolfpackauto.com",
  "localhost",
  "example.com",
]);

function isValidUUID(value: string): boolean {
  return UUID_RE.test(value);
}

function isValidDomain(value: string): boolean {
  return DOMAIN_RE.test(value) && value.length <= 253;
}

// ---------------------------------------------------------------------------
// POST — Register a custom domain
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;

  try {
    const body = await request.json();
    const { dealerId, domain } = body as {
      dealerId?: string;
      domain?: string;
    };

    // Validate inputs
    if (!dealerId || !isValidUUID(dealerId)) {
      return NextResponse.json(
        { error: "Invalid or missing dealerId (must be UUID)" },
        { status: 400 },
      );
    }

    if (!domain || !isValidDomain(domain)) {
      return NextResponse.json(
        { error: "Invalid or missing domain" },
        { status: 400 },
      );
    }

    const normalizedDomain = domain.toLowerCase().trim();

    if (BLOCKED_DOMAINS.has(normalizedDomain)) {
      return NextResponse.json(
        { error: "This domain cannot be registered" },
        { status: 400 },
      );
    }

    // Insert domain record
    const record = await addDomain(dealerId, normalizedDomain);

    return NextResponse.json(
      {
        domain: record,
        verification: {
          type: "DNS TXT",
          host: `_wolfpack-verify.${normalizedDomain}`,
          value: record.dns_txt_record,
          instructions:
            `Add a DNS TXT record at _wolfpack-verify.${normalizedDomain} ` +
            `with value "${record.dns_txt_record}" to verify domain ownership. ` +
            `Once verified, SSL will be provisioned automatically.`,
        },
      },
      { status: 201 },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";

    // Unique constraint violation — domain already registered
    if (message.includes("unique") || message.includes("duplicate")) {
      return NextResponse.json(
        { error: "This domain is already registered" },
        { status: 409 },
      );
    }

    console.error("[api/admin/domains] POST error:", message);
    return NextResponse.json(
      { error: "Failed to register domain" },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// GET — List domains for a dealer
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;

  const { searchParams } = request.nextUrl;
  const dealerId = searchParams.get("dealerId");

  if (!dealerId || !isValidUUID(dealerId)) {
    return NextResponse.json(
      { error: "Missing or invalid dealerId query parameter" },
      { status: 400 },
    );
  }

  try {
    const domains = await getDomains(dealerId);

    return NextResponse.json({
      dealerId,
      domains,
      count: domains.length,
    });
  } catch (err) {
    console.error("[api/admin/domains] GET error:", err);
    return NextResponse.json(
      { error: "Failed to fetch domains" },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// DELETE — Remove a custom domain
// ---------------------------------------------------------------------------

export async function DELETE(request: NextRequest) {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;

  const { searchParams } = request.nextUrl;
  const domainId = searchParams.get("domainId");
  const dealerId = searchParams.get("dealerId");

  if (!domainId || !isValidUUID(domainId)) {
    return NextResponse.json(
      { error: "Missing or invalid domainId query parameter" },
      { status: 400 },
    );
  }

  if (!dealerId || !isValidUUID(dealerId)) {
    return NextResponse.json(
      { error: "Missing or invalid dealerId query parameter" },
      { status: 400 },
    );
  }

  try {
    const deleted = await removeDomain(domainId, dealerId);

    if (!deleted) {
      return NextResponse.json(
        { error: "Domain not found or does not belong to this dealer" },
        { status: 404 },
      );
    }

    // Invalidate tenant cache so the domain stops routing immediately
    await invalidateTenantCache(dealerId);

    return NextResponse.json({ deleted: true, domainId });
  } catch (err) {
    console.error("[api/admin/domains] DELETE error:", err);
    return NextResponse.json(
      { error: "Failed to remove domain" },
      { status: 500 },
    );
  }
}
