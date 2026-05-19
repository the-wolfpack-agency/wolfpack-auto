/**
 * Per-page title branding helper.
 *
 * The root layout sets the metadata `template: "%s | <dealer.name>"`, so
 * individual `metadata.title: "Foo"` exports already get composed correctly
 * when running under a dealer context.
 *
 * For pages that previously hardcoded the brand suffix ("Foo — Wolfpack Auto")
 * we want one tidy helper that:
 *   - Returns a branded title using the dealer's name when one is resolvable.
 *   - Falls back to "<pageTitle> | Wolfpack Auto" (the PLATFORM name) on the
 *     unbranded demo deployment — never the seed dealer "Wolfpack Motors".
 *
 * Safe to call from server components and `generateMetadata` exports.
 */

import { getDealerConfig, DEFAULT_CONFIG } from "@/lib/dealer-config";

const PLATFORM_NAME = "Wolfpack Auto";

/**
 * Return a branded page title. Resolution order:
 *   1. Active dealer name from getDealerConfig() when it differs from the
 *      seed default ("Wolfpack Motors") — this is a real branded tenant.
 *   2. Platform name ("Wolfpack Auto") as the universal fallback.
 *
 * Optional `dealerId` lets callers pin the lookup (e.g. from a tenant
 * resolver) instead of relying on the env default.
 */
export async function getDealerBrandedTitle(
  pageTitle: string,
  dealerId?: string,
): Promise<string> {
  const trimmed = pageTitle?.trim() ?? "";
  const safeTitle = trimmed.length > 0 ? trimmed : PLATFORM_NAME;

  try {
    const cfg = await getDealerConfig(dealerId);
    const name = (cfg?.name ?? "").trim();
    if (name && name !== DEFAULT_CONFIG.name) {
      return `${safeTitle} | ${name}`;
    }
  } catch {
    // Fall through to platform branding — never throw from a metadata helper.
  }

  return `${safeTitle} | ${PLATFORM_NAME}`;
}

/** Synchronous variant for callers that already hold the dealer name. */
export function brandedTitle(
  pageTitle: string,
  dealerName?: string | null,
): string {
  const trimmed = pageTitle?.trim() ?? "";
  const safeTitle = trimmed.length > 0 ? trimmed : PLATFORM_NAME;
  const name = (dealerName ?? "").trim();
  if (name && name !== DEFAULT_CONFIG.name) {
    return `${safeTitle} | ${name}`;
  }
  return `${safeTitle} | ${PLATFORM_NAME}`;
}
