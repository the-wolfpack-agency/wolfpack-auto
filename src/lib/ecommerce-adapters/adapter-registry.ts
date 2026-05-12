/**
 * E-commerce adapter registry.
 *
 * Mirrors `src/lib/dms-adapters/adapter-registry.ts` exactly. Two
 * responsibilities:
 *
 * 1. **Factory routing.** Given a provider slug and (decrypted) credentials,
 *    return the right `EcommerceAdapter` instance. Adapters can be
 *    registered dynamically via `registerEcommerceAdapter()` — used in
 *    tests and (future) by a plugin loader.
 *
 * 2. **Per-tenant configuration persistence.** Read/write the
 *    `ecommerce_adapter_credentials` table from migration 082, using the
 *    AES-256-GCM crypto vault from migration 069's
 *    `src/lib/external-credentials/crypto-vault.ts`. The same vault is
 *    intentionally reused — DRY per CLAUDE.md, single auditable cipher
 *    surface across DMS + e-commerce + BYO credentials.
 *
 * Mutation entry points fire:
 *   - audit_log row (via `lib/audit-log.ts`)
 *   - typed analytics event (`ecommerce_adapter.configured` /
 *     `.credential_rotated` / `.action_executed` / `.action_failed`)
 *   - graceful no-op when DATABASE_URL is absent (shadow-mode dev) so
 *     `npm run dev` works without a Postgres process.
 */

import { auditLog } from "@/lib/audit-log";
import { trackEcommerceAdapter } from "@/lib/analytics-hooks";
import {
  decryptCredential,
  encryptCredential,
} from "@/lib/external-credentials/crypto-vault";
import type { EcommerceAdapter } from "./adapter-interface";
import {
  createAdobeCommerceAdapter,
  type AdobeCommerceCredentials,
} from "./adobe-commerce-adapter";
import {
  createAttentiveAdapter,
  type AttentiveCredentials,
} from "./attentive-adapter";
import {
  createBigCommerceAdapter,
  type BigCommerceCredentials,
} from "./bigcommerce-adapter";
import {
  createGoogleAdsAdapter,
  type GoogleAdsCredentials,
} from "./google-ads-adapter";
import {
  createKlaviyoAdapter,
  type KlaviyoCredentials,
} from "./klaviyo-adapter";
import {
  createMetaAdsAdapter,
  type MetaAdsCredentials,
} from "./meta-ads-adapter";
import { createMockEcommerceAdapter } from "./mock-adapter";
import {
  createShopifyAdapter,
  type ShopifyCredentials,
} from "./shopify-adapter";
import {
  ALL_ECOMMERCE_ADAPTER_PROVIDERS,
  type AdapterCredentialStatus,
  type ConfiguredEcommerceAdapterRecord,
  type EcommerceAdapterProvider,
  type EcommerceCapability,
} from "./types";

// ---------------------------------------------------------------------------
// Factory map
// ---------------------------------------------------------------------------

type AdapterFactory = (creds: unknown) => EcommerceAdapter;

const factories = new Map<string, AdapterFactory>();

/**
 * Register an adapter factory. Provider slug must match the migration 082
 * CHECK constraint. Re-registering a known provider replaces the factory
 * — useful in tests when stubbing.
 */
export function registerEcommerceAdapter(provider: string, factory: AdapterFactory): void {
  factories.set(provider, factory);
}

/** List provider slugs currently registered with a factory. */
export function listAvailableEcommerceAdapters(): string[] {
  return Array.from(factories.keys());
}

/** Test-only: clear the registry. Re-run `seedDefaultEcommerceAdapters()` after. */
export function _resetEcommerceRegistryForTests(): void {
  factories.clear();
  seedDefaultEcommerceAdapters();
}

/**
 * Seed the default factories for the year-2 provider set. Idempotent —
 * registering twice replaces the prior factory but does not throw.
 */
export function seedDefaultEcommerceAdapters(): void {
  registerEcommerceAdapter("mock_shop", () => createMockEcommerceAdapter());
  registerEcommerceAdapter("shopify", (creds: unknown) =>
    createShopifyAdapter((creds as ShopifyCredentials | null) ?? null),
  );
  registerEcommerceAdapter("bigcommerce", (creds: unknown) =>
    createBigCommerceAdapter((creds as BigCommerceCredentials | null) ?? null),
  );
  registerEcommerceAdapter("adobe_commerce", (creds: unknown) =>
    createAdobeCommerceAdapter((creds as AdobeCommerceCredentials | null) ?? null),
  );
  registerEcommerceAdapter("klaviyo", (creds: unknown) =>
    createKlaviyoAdapter((creds as KlaviyoCredentials | null) ?? null),
  );
  registerEcommerceAdapter("attentive", (creds: unknown) =>
    createAttentiveAdapter((creds as AttentiveCredentials | null) ?? null),
  );
  registerEcommerceAdapter("meta_ads", (creds: unknown) =>
    createMetaAdsAdapter((creds as MetaAdsCredentials | null) ?? null),
  );
  registerEcommerceAdapter("google_ads", (creds: unknown) =>
    createGoogleAdsAdapter((creds as GoogleAdsCredentials | null) ?? null),
  );
}

// Seed on module load so callers can import + use without bootstrapping.
seedDefaultEcommerceAdapters();

// ---------------------------------------------------------------------------
// Configuration persistence (migration 082)
// ---------------------------------------------------------------------------

export interface ConfigureEcommerceAdapterInput {
  tenantId: string;
  provider: EcommerceAdapterProvider;
  /**
   * Credential payload in plaintext — JSON-stringified before encryption.
   * Mock provider may omit this (creds are unused) but the row is still
   * written for visibility in the tenant-admin UI.
   */
  plaintextCredentials?: Record<string, unknown>;
  /** Optional override of the capabilities snapshot. Defaults to adapter declaration. */
  capabilitySet?: EcommerceCapability[];
  actorUserId?: string;
}

export interface ConfiguredEcommerceAdapterRow {
  id: string;
  tenant_id: string;
  provider: string;
  status: string;
  capability_set: EcommerceCapability[] | null;
  last_used_at: Date | null;
  last_error: string | null;
  created_at: Date;
  updated_at: Date;
}

/**
 * Upsert credentials for a (tenant, provider) pair. Returns the
 * redacted record (no plaintext, no ciphertext).
 */
export async function configureEcommerceAdapter(
  input: ConfigureEcommerceAdapterInput,
): Promise<ConfiguredEcommerceAdapterRecord> {
  validateProvider(input.provider);

  let ciphertext: Buffer | null = null;
  let iv: Buffer | null = null;
  if (input.plaintextCredentials !== undefined) {
    const plaintext = JSON.stringify(input.plaintextCredentials);
    const blob = encryptCredential(plaintext);
    ciphertext = blob.ciphertext;
    iv = blob.iv;
  }

  // Determine the capability snapshot. If not supplied, instantiate the
  // adapter (with the supplied creds) and read its declared set.
  let capabilitySnapshot: EcommerceCapability[];
  if (input.capabilitySet) {
    capabilitySnapshot = input.capabilitySet;
  } else {
    const adapter = factoryFor(input.provider)(input.plaintextCredentials ?? null);
    capabilitySnapshot = Array.from(adapter.capabilities);
  }

  const status: AdapterCredentialStatus = ciphertext ? "active" : "pending";

  if (!process.env.DATABASE_URL) {
    // Shadow mode — return a synthetic record so dev workflows work
    // without a Postgres process. Audit + analytics still fire.
    const synthetic: ConfiguredEcommerceAdapterRecord = {
      id: `shadow-${Date.now()}`,
      tenantId: input.tenantId,
      provider: input.provider,
      status,
      capabilitySet: capabilitySnapshot,
      lastUsedAt: null,
      lastError: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    fireConfigureSignals(synthetic, input.actorUserId);
    return synthetic;
  }

  const { query } = await import("@/lib/db");
  const result = await query<ConfiguredEcommerceAdapterRow>(
    `INSERT INTO ecommerce_adapter_credentials
       (tenant_id, provider, credential_blob_encrypted, credential_iv, status, capability_set)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb)
     ON CONFLICT (tenant_id, provider)
       DO UPDATE SET
         credential_blob_encrypted = COALESCE(EXCLUDED.credential_blob_encrypted, ecommerce_adapter_credentials.credential_blob_encrypted),
         credential_iv             = COALESCE(EXCLUDED.credential_iv, ecommerce_adapter_credentials.credential_iv),
         status                    = EXCLUDED.status,
         capability_set            = EXCLUDED.capability_set,
         last_error                = NULL,
         updated_at                = NOW()
     RETURNING id, tenant_id, provider, status, capability_set,
               last_used_at, last_error, created_at, updated_at`,
    [
      input.tenantId,
      input.provider,
      ciphertext,
      iv,
      status,
      JSON.stringify(capabilitySnapshot),
    ],
  );

  const row = (result.rows as ConfiguredEcommerceAdapterRow[])[0];
  const record = rowToRecord(row);
  fireConfigureSignals(record, input.actorUserId);
  return record;
}

/** Read the redacted record for a (tenant, provider) pair. */
export async function getConfiguredEcommerceAdapter(
  tenantId: string,
  provider: EcommerceAdapterProvider,
): Promise<ConfiguredEcommerceAdapterRecord | null> {
  validateProvider(provider);
  if (!process.env.DATABASE_URL) return null;

  const { query } = await import("@/lib/db");
  const result = await query<ConfiguredEcommerceAdapterRow>(
    `SELECT id, tenant_id, provider, status, capability_set,
            last_used_at, last_error, created_at, updated_at
       FROM ecommerce_adapter_credentials
      WHERE tenant_id = $1 AND provider = $2
      LIMIT 1`,
    [tenantId, provider],
  );
  const row = (result.rows as ConfiguredEcommerceAdapterRow[])[0];
  return row ? rowToRecord(row) : null;
}

/** List all configured adapters for a tenant. */
export async function listConfiguredEcommerceAdapters(
  tenantId: string,
): Promise<ConfiguredEcommerceAdapterRecord[]> {
  if (!process.env.DATABASE_URL) return [];
  const { query } = await import("@/lib/db");
  const result = await query<ConfiguredEcommerceAdapterRow>(
    `SELECT id, tenant_id, provider, status, capability_set,
            last_used_at, last_error, created_at, updated_at
       FROM ecommerce_adapter_credentials
      WHERE tenant_id = $1
      ORDER BY provider ASC`,
    [tenantId],
  );
  return (result.rows as ConfiguredEcommerceAdapterRow[]).map(rowToRecord);
}

/**
 * Rotate the plaintext credentials for an existing (tenant, provider) pair.
 * Flips status to 'active' and emits ecommerce_adapter.credential_rotated.
 */
export async function rotateEcommerceAdapterCredentials(input: {
  tenantId: string;
  provider: EcommerceAdapterProvider;
  newPlaintextCredentials: Record<string, unknown>;
  actorUserId?: string;
}): Promise<ConfiguredEcommerceAdapterRecord | null> {
  validateProvider(input.provider);
  const plaintext = JSON.stringify(input.newPlaintextCredentials);
  const blob = encryptCredential(plaintext);

  if (!process.env.DATABASE_URL) return null;
  const { query } = await import("@/lib/db");
  const result = await query<ConfiguredEcommerceAdapterRow>(
    `UPDATE ecommerce_adapter_credentials
        SET credential_blob_encrypted = $1,
            credential_iv             = $2,
            status                    = 'active',
            last_error                = NULL,
            updated_at                = NOW()
      WHERE tenant_id = $3 AND provider = $4
      RETURNING id, tenant_id, provider, status, capability_set,
                last_used_at, last_error, created_at, updated_at`,
    [blob.ciphertext, blob.iv, input.tenantId, input.provider],
  );

  const row = (result.rows as ConfiguredEcommerceAdapterRow[])[0];
  if (!row) return null;
  const record = rowToRecord(row);

  trackEcommerceAdapter("ecommerce_adapter.credential_rotated", record.tenantId, {
    provider: record.provider,
    adapter_id: record.id,
    actor: input.actorUserId ?? "unknown",
  });
  void auditLog(
    "ecommerce_adapter.credential_rotated",
    { adapter_id: record.id, provider: record.provider },
    input.actorUserId,
    record.tenantId,
  );
  return record;
}

/**
 * Soft-revoke an adapter (flips status to 'revoked', keeps the audit chain
 * intact). For destructive removal use `deleteEcommerceAdapter`.
 */
export async function revokeEcommerceAdapter(
  tenantId: string,
  provider: EcommerceAdapterProvider,
  actorUserId?: string,
): Promise<ConfiguredEcommerceAdapterRecord | null> {
  validateProvider(provider);
  if (!process.env.DATABASE_URL) return null;
  const { query } = await import("@/lib/db");
  const result = await query<ConfiguredEcommerceAdapterRow>(
    `UPDATE ecommerce_adapter_credentials
        SET status     = 'revoked',
            updated_at = NOW()
      WHERE tenant_id = $1 AND provider = $2 AND status <> 'revoked'
      RETURNING id, tenant_id, provider, status, capability_set,
                last_used_at, last_error, created_at, updated_at`,
    [tenantId, provider],
  );
  const row = (result.rows as ConfiguredEcommerceAdapterRow[])[0];
  if (!row) return null;
  const record = rowToRecord(row);
  void auditLog(
    "ecommerce_adapter.revoked",
    { adapter_id: record.id, provider: record.provider },
    actorUserId,
    record.tenantId,
  );
  return record;
}

/** Hard-delete an adapter row. Prefer revoke. */
export async function deleteEcommerceAdapter(
  tenantId: string,
  provider: EcommerceAdapterProvider,
  actorUserId?: string,
): Promise<boolean> {
  validateProvider(provider);
  if (!process.env.DATABASE_URL) return false;
  const { query } = await import("@/lib/db");
  const result = await query<{ id: string }>(
    `DELETE FROM ecommerce_adapter_credentials
      WHERE tenant_id = $1 AND provider = $2
      RETURNING id`,
    [tenantId, provider],
  );
  const deleted = (result.rows as Array<{ id: string }>).length > 0;
  if (deleted) {
    void auditLog(
      "ecommerce_adapter.deleted",
      { provider },
      actorUserId,
      tenantId,
    );
  }
  return deleted;
}

// ---------------------------------------------------------------------------
// Adapter resolution (the "give me the tenant's adapter" entry point)
// ---------------------------------------------------------------------------

/**
 * Resolve a runtime adapter instance for (provider, tenant). Returns null
 * when the tenant has no row for that provider OR the row is revoked.
 *
 * The returned adapter is a freshly-instantiated object — caller may keep
 * it for the duration of the request, but do NOT memoize across tenants.
 */
export async function getEcommerceAdapter(
  provider: string,
  tenantId: string,
): Promise<EcommerceAdapter | null> {
  if (!ALL_ECOMMERCE_ADAPTER_PROVIDERS.includes(provider as EcommerceAdapterProvider)) {
    return null;
  }
  const slug = provider as EcommerceAdapterProvider;
  const factory = factories.get(slug);
  if (!factory) return null;

  // Mock provider: no credential needed. Useful in tests + demo.
  if (slug === "mock_shop") {
    return factory(null);
  }

  if (!process.env.DATABASE_URL) {
    // Shadow mode — return a stub adapter (no creds, all methods return
    // not_configured). Lets the route layer 200 + render the empty state
    // even without a real DB.
    return factory(null);
  }

  const { query } = await import("@/lib/db");
  const result = await query<{
    credential_blob_encrypted: Buffer | null;
    credential_iv: Buffer | null;
    status: string;
  }>(
    `SELECT credential_blob_encrypted, credential_iv, status
       FROM ecommerce_adapter_credentials
      WHERE tenant_id = $1 AND provider = $2
      LIMIT 1`,
    [tenantId, slug],
  );
  const row = (result.rows as Array<{
    credential_blob_encrypted: Buffer | null;
    credential_iv: Buffer | null;
    status: string;
  }>)[0];

  if (!row || row.status === "revoked") {
    return null;
  }

  if (!row.credential_blob_encrypted || !row.credential_iv) {
    return factory(null);
  }

  let creds: Record<string, unknown> | null = null;
  try {
    const plaintext = decryptCredential({
      ciphertext: Buffer.from(row.credential_blob_encrypted),
      iv: Buffer.from(row.credential_iv),
    });
    creds = JSON.parse(plaintext) as Record<string, unknown>;
  } catch {
    // Auth-tag failure / key drift — return the stub adapter so call
    // sites still 200 with not_configured.
    return factory(null);
  }
  return factory(creds);
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function validateProvider(
  provider: string,
): asserts provider is EcommerceAdapterProvider {
  if (
    !ALL_ECOMMERCE_ADAPTER_PROVIDERS.includes(provider as EcommerceAdapterProvider)
  ) {
    throw new Error(`unknown e-commerce adapter provider: ${provider}`);
  }
}

function factoryFor(provider: EcommerceAdapterProvider): AdapterFactory {
  const f = factories.get(provider);
  if (!f) {
    throw new Error(`no factory registered for provider: ${provider}`);
  }
  return f;
}

function rowToRecord(
  row: ConfiguredEcommerceAdapterRow,
): ConfiguredEcommerceAdapterRecord {
  const caps: EcommerceCapability[] = Array.isArray(row.capability_set)
    ? (row.capability_set as EcommerceCapability[])
    : [];
  return {
    id: row.id,
    tenantId: row.tenant_id,
    provider: row.provider as EcommerceAdapterProvider,
    status: row.status as AdapterCredentialStatus,
    capabilitySet: caps,
    lastUsedAt: row.last_used_at ? new Date(row.last_used_at).toISOString() : null,
    lastError: row.last_error,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

function fireConfigureSignals(
  record: ConfiguredEcommerceAdapterRecord,
  actorUserId: string | undefined,
): void {
  trackEcommerceAdapter("ecommerce_adapter.configured", record.tenantId, {
    provider: record.provider,
    adapter_id: record.id,
    status: record.status,
    actor: actorUserId ?? "unknown",
  });
  void auditLog(
    "ecommerce_adapter.configured",
    {
      adapter_id: record.id,
      provider: record.provider,
      status: record.status,
    },
    actorUserId,
    record.tenantId,
  );
}

/**
 * Helper used by callers that just executed an adapter action and want
 * to fire both the analytics event + audit log in one call. Centralised
 * so the wiring stays consistent.
 */
export async function recordEcommerceActionExecuted(args: {
  tenantId: string;
  provider: EcommerceAdapterProvider;
  adapterId: string;
  capability: EcommerceCapability;
  ok: boolean;
  detail?: string;
  actorUserId?: string;
}): Promise<void> {
  if (args.ok) {
    trackEcommerceAdapter("ecommerce_adapter.action_executed", args.tenantId, {
      provider: args.provider,
      adapter_id: args.adapterId,
      capability: args.capability,
      actor: args.actorUserId ?? "unknown",
    });
    void auditLog(
      "ecommerce_adapter.action_executed",
      {
        adapter_id: args.adapterId,
        provider: args.provider,
        capability: args.capability,
      },
      args.actorUserId,
      args.tenantId,
    );
  } else {
    trackEcommerceAdapter("ecommerce_adapter.action_failed", args.tenantId, {
      provider: args.provider,
      adapter_id: args.adapterId,
      capability: args.capability,
      detail: args.detail ?? "",
      actor: args.actorUserId ?? "unknown",
    });
    void auditLog(
      "ecommerce_adapter.action_failed",
      {
        adapter_id: args.adapterId,
        provider: args.provider,
        capability: args.capability,
        detail: args.detail ?? "",
      },
      args.actorUserId,
      args.tenantId,
    );
  }
}
