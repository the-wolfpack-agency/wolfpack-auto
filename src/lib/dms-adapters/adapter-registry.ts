/**
 * DMS adapter registry.
 *
 * Two responsibilities:
 *
 * 1. **Factory routing.** Given a provider slug and (decrypted) credentials,
 *    return the right `DMSAdapter` instance. Adapters can be registered
 *    dynamically via `registerAdapter()` — used in tests and (future) by a
 *    plugin loader.
 *
 * 2. **Per-dealer configuration persistence.** Read/write the
 *    `dms_adapter_credentials` table from migration 079, using the
 *    AES-256-GCM crypto vault from migration 069's
 *    `src/lib/external-credentials/crypto-vault.ts`. The same vault is
 *    intentionally reused — DRY per CLAUDE.md, single auditable cipher
 *    surface.
 *
 * Mutation entry points fire:
 *   - audit_log row (via `lib/audit-log.ts`)
 *   - typed analytics event (`dms_adapter.configured` /
 *     `dms_adapter.credential_rotated` / `dms_adapter.action_failed`)
 *   - graceful no-op when DATABASE_URL is absent (shadow-mode dev) so
 *     `npm run dev` works without a Postgres process.
 */

import { auditLog } from "@/lib/audit-log";
import { trackDMSAdapter } from "@/lib/analytics-hooks";
import {
  decryptCredential,
  encryptCredential,
} from "@/lib/external-credentials/crypto-vault";
import type { DMSAdapter } from "./adapter-interface";
import { createCDKAdapter, type CDKCredentials } from "./cdk-adapter";
import { createCoxVAutoAdapter, type CoxVAutoCredentials } from "./cox-vauto-adapter";
import { createDealerSocketAdapter, type DealerSocketCredentials } from "./dealersocket-adapter";
import { createMockAdapter } from "./mock-adapter";
import {
  ALL_ADAPTER_PROVIDERS,
  type AdapterCapability,
  type AdapterCredentialStatus,
  type ConfiguredAdapterRecord,
  type DMSAdapterProvider,
} from "./types";

// ---------------------------------------------------------------------------
// Factory map
// ---------------------------------------------------------------------------

type AdapterFactory = (creds: unknown) => DMSAdapter;

const factories = new Map<string, AdapterFactory>();

/**
 * Register an adapter factory. Provider slug must match the migration 079
 * CHECK constraint. Re-registering a known provider replaces the factory
 * — useful in tests when stubbing.
 */
export function registerAdapter(provider: string, factory: AdapterFactory): void {
  factories.set(provider, factory);
}

/** List provider slugs currently registered with a factory. */
export function listAvailableAdapters(): string[] {
  return Array.from(factories.keys());
}

/** Test-only: clear the registry. Re-run `seedDefaultAdapters()` after. */
export function _resetRegistryForTests(): void {
  factories.clear();
  seedDefaultAdapters();
}

/**
 * Seed the default factories for the year-one provider set. Idempotent —
 * registering twice replaces the prior factory but does not throw.
 */
export function seedDefaultAdapters(): void {
  registerAdapter("mock", () => createMockAdapter());
  registerAdapter("cox_vauto", (creds: unknown) =>
    createCoxVAutoAdapter((creds as CoxVAutoCredentials | null) ?? null),
  );
  registerAdapter("dealersocket", (creds: unknown) =>
    createDealerSocketAdapter((creds as DealerSocketCredentials | null) ?? null),
  );
  registerAdapter("cdk", (creds: unknown) =>
    createCDKAdapter((creds as CDKCredentials | null) ?? null),
  );
}

// Seed on module load so callers can import + use without bootstrapping.
seedDefaultAdapters();

// ---------------------------------------------------------------------------
// Configuration persistence (migration 079)
// ---------------------------------------------------------------------------

export interface ConfigureAdapterInput {
  dealerId: string;
  provider: DMSAdapterProvider;
  /**
   * Credential payload in plaintext — JSON-stringified before encryption.
   * Mock provider may omit this (creds are unused) but the row is still
   * written for visibility in the dealer-admin UI.
   */
  plaintextCredentials?: Record<string, unknown>;
  /** Optional override of the capabilities snapshot. Defaults to adapter declaration. */
  capabilitySet?: AdapterCapability[];
  actorUserId?: string;
}

export interface ConfiguredAdapterRow {
  id: string;
  dealer_id: string;
  provider: string;
  status: string;
  capability_set: AdapterCapability[] | null;
  last_used_at: Date | null;
  last_error: string | null;
  created_at: Date;
  updated_at: Date;
}

/**
 * Upsert credentials for a (dealer, provider) pair. Returns the
 * redacted record (no plaintext, no ciphertext).
 */
export async function configureAdapter(
  input: ConfigureAdapterInput,
): Promise<ConfiguredAdapterRecord> {
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
  let capabilitySnapshot: AdapterCapability[];
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
    const synthetic: ConfiguredAdapterRecord = {
      id: `shadow-${Date.now()}`,
      dealerId: input.dealerId,
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
  const result = await query<ConfiguredAdapterRow>(
    `INSERT INTO dms_adapter_credentials
       (dealer_id, provider, credential_blob_encrypted, credential_iv, status, capability_set)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb)
     ON CONFLICT (dealer_id, provider)
       DO UPDATE SET
         credential_blob_encrypted = COALESCE(EXCLUDED.credential_blob_encrypted, dms_adapter_credentials.credential_blob_encrypted),
         credential_iv             = COALESCE(EXCLUDED.credential_iv, dms_adapter_credentials.credential_iv),
         status                    = EXCLUDED.status,
         capability_set            = EXCLUDED.capability_set,
         last_error                = NULL,
         updated_at                = NOW()
     RETURNING id, dealer_id, provider, status, capability_set,
               last_used_at, last_error, created_at, updated_at`,
    [
      input.dealerId,
      input.provider,
      ciphertext,
      iv,
      status,
      JSON.stringify(capabilitySnapshot),
    ],
  );

  const row = (result.rows as ConfiguredAdapterRow[])[0];
  const record = rowToRecord(row);
  fireConfigureSignals(record, input.actorUserId);
  return record;
}

/** Read the redacted record for a (dealer, provider) pair. */
export async function getConfiguredAdapter(
  dealerId: string,
  provider: DMSAdapterProvider,
): Promise<ConfiguredAdapterRecord | null> {
  validateProvider(provider);
  if (!process.env.DATABASE_URL) return null;

  const { query } = await import("@/lib/db");
  const result = await query<ConfiguredAdapterRow>(
    `SELECT id, dealer_id, provider, status, capability_set,
            last_used_at, last_error, created_at, updated_at
       FROM dms_adapter_credentials
      WHERE dealer_id = $1 AND provider = $2
      LIMIT 1`,
    [dealerId, provider],
  );
  const row = (result.rows as ConfiguredAdapterRow[])[0];
  return row ? rowToRecord(row) : null;
}

/** List all configured adapters for a dealer. */
export async function listConfiguredAdapters(
  dealerId: string,
): Promise<ConfiguredAdapterRecord[]> {
  if (!process.env.DATABASE_URL) return [];
  const { query } = await import("@/lib/db");
  const result = await query<ConfiguredAdapterRow>(
    `SELECT id, dealer_id, provider, status, capability_set,
            last_used_at, last_error, created_at, updated_at
       FROM dms_adapter_credentials
      WHERE dealer_id = $1
      ORDER BY provider ASC`,
    [dealerId],
  );
  return (result.rows as ConfiguredAdapterRow[]).map(rowToRecord);
}

/**
 * Rotate the plaintext credentials for an existing (dealer, provider) pair.
 * Flips status to 'active' and emits dms_adapter.credential_rotated.
 */
export async function rotateAdapterCredentials(input: {
  dealerId: string;
  provider: DMSAdapterProvider;
  newPlaintextCredentials: Record<string, unknown>;
  actorUserId?: string;
}): Promise<ConfiguredAdapterRecord | null> {
  validateProvider(input.provider);
  const plaintext = JSON.stringify(input.newPlaintextCredentials);
  const blob = encryptCredential(plaintext);

  if (!process.env.DATABASE_URL) return null;
  const { query } = await import("@/lib/db");
  const result = await query<ConfiguredAdapterRow>(
    `UPDATE dms_adapter_credentials
        SET credential_blob_encrypted = $1,
            credential_iv             = $2,
            status                    = 'active',
            last_error                = NULL,
            updated_at                = NOW()
      WHERE dealer_id = $3 AND provider = $4
      RETURNING id, dealer_id, provider, status, capability_set,
                last_used_at, last_error, created_at, updated_at`,
    [blob.ciphertext, blob.iv, input.dealerId, input.provider],
  );

  const row = (result.rows as ConfiguredAdapterRow[])[0];
  if (!row) return null;
  const record = rowToRecord(row);

  trackDMSAdapter("dms_adapter.credential_rotated", record.dealerId, {
    provider: record.provider,
    adapter_id: record.id,
    actor: input.actorUserId ?? "unknown",
  });
  void auditLog(
    "dms_adapter.credential_rotated",
    { adapter_id: record.id, provider: record.provider },
    input.actorUserId,
    record.dealerId,
  );
  return record;
}

/**
 * Soft-revoke an adapter (flips status to 'revoked', keeps the audit chain
 * intact). For destructive removal use `deleteAdapter`.
 */
export async function revokeAdapter(
  dealerId: string,
  provider: DMSAdapterProvider,
  actorUserId?: string,
): Promise<ConfiguredAdapterRecord | null> {
  validateProvider(provider);
  if (!process.env.DATABASE_URL) return null;
  const { query } = await import("@/lib/db");
  const result = await query<ConfiguredAdapterRow>(
    `UPDATE dms_adapter_credentials
        SET status     = 'revoked',
            updated_at = NOW()
      WHERE dealer_id = $1 AND provider = $2 AND status <> 'revoked'
      RETURNING id, dealer_id, provider, status, capability_set,
                last_used_at, last_error, created_at, updated_at`,
    [dealerId, provider],
  );
  const row = (result.rows as ConfiguredAdapterRow[])[0];
  if (!row) return null;
  const record = rowToRecord(row);
  void auditLog(
    "dms_adapter.revoked",
    { adapter_id: record.id, provider: record.provider },
    actorUserId,
    record.dealerId,
  );
  return record;
}

/** Hard-delete an adapter row. Prefer revoke. */
export async function deleteAdapter(
  dealerId: string,
  provider: DMSAdapterProvider,
  actorUserId?: string,
): Promise<boolean> {
  validateProvider(provider);
  if (!process.env.DATABASE_URL) return false;
  const { query } = await import("@/lib/db");
  const result = await query<{ id: string }>(
    `DELETE FROM dms_adapter_credentials
      WHERE dealer_id = $1 AND provider = $2
      RETURNING id`,
    [dealerId, provider],
  );
  const deleted = (result.rows as Array<{ id: string }>).length > 0;
  if (deleted) {
    void auditLog(
      "dms_adapter.deleted",
      { provider },
      actorUserId,
      dealerId,
    );
  }
  return deleted;
}

// ---------------------------------------------------------------------------
// Adapter resolution (the "give me the dealer's adapter" entry point)
// ---------------------------------------------------------------------------

/**
 * Resolve a runtime adapter instance for (provider, dealer). Returns null
 * when the dealer has no row for that provider OR the row is revoked.
 *
 * The returned adapter is a freshly-instantiated object — caller may keep
 * it for the duration of the request, but do NOT memoize across dealers.
 */
export async function getAdapter(
  provider: string,
  dealerId: string,
): Promise<DMSAdapter | null> {
  if (!ALL_ADAPTER_PROVIDERS.includes(provider as DMSAdapterProvider)) {
    return null;
  }
  const slug = provider as DMSAdapterProvider;
  const factory = factories.get(slug);
  if (!factory) return null;

  // Mock provider: no credential needed. Useful in tests + demo.
  if (slug === "mock") {
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
       FROM dms_adapter_credentials
      WHERE dealer_id = $1 AND provider = $2
      LIMIT 1`,
    [dealerId, slug],
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

function validateProvider(provider: string): asserts provider is DMSAdapterProvider {
  if (!ALL_ADAPTER_PROVIDERS.includes(provider as DMSAdapterProvider)) {
    throw new Error(`unknown DMS adapter provider: ${provider}`);
  }
}

function factoryFor(provider: DMSAdapterProvider): AdapterFactory {
  const f = factories.get(provider);
  if (!f) {
    throw new Error(`no factory registered for provider: ${provider}`);
  }
  return f;
}

function rowToRecord(row: ConfiguredAdapterRow): ConfiguredAdapterRecord {
  const caps: AdapterCapability[] = Array.isArray(row.capability_set)
    ? (row.capability_set as AdapterCapability[])
    : [];
  return {
    id: row.id,
    dealerId: row.dealer_id,
    provider: row.provider as DMSAdapterProvider,
    status: row.status as AdapterCredentialStatus,
    capabilitySet: caps,
    lastUsedAt: row.last_used_at ? new Date(row.last_used_at).toISOString() : null,
    lastError: row.last_error,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

function fireConfigureSignals(
  record: ConfiguredAdapterRecord,
  actorUserId: string | undefined,
): void {
  trackDMSAdapter("dms_adapter.configured", record.dealerId, {
    provider: record.provider,
    adapter_id: record.id,
    status: record.status,
    actor: actorUserId ?? "unknown",
  });
  void auditLog(
    "dms_adapter.configured",
    {
      adapter_id: record.id,
      provider: record.provider,
      status: record.status,
    },
    actorUserId,
    record.dealerId,
  );
}

/**
 * Helper used by callers that just executed an adapter action and want
 * to fire both the analytics event + audit log in one call. Centralised
 * so the wiring stays consistent.
 */
export async function recordActionExecuted(args: {
  dealerId: string;
  provider: DMSAdapterProvider;
  adapterId: string;
  capability: AdapterCapability;
  ok: boolean;
  detail?: string;
  actorUserId?: string;
}): Promise<void> {
  if (args.ok) {
    trackDMSAdapter("dms_adapter.action_executed", args.dealerId, {
      provider: args.provider,
      adapter_id: args.adapterId,
      capability: args.capability,
      actor: args.actorUserId ?? "unknown",
    });
    void auditLog(
      "dms_adapter.action_executed",
      {
        adapter_id: args.adapterId,
        provider: args.provider,
        capability: args.capability,
      },
      args.actorUserId,
      args.dealerId,
    );
  } else {
    trackDMSAdapter("dms_adapter.action_failed", args.dealerId, {
      provider: args.provider,
      adapter_id: args.adapterId,
      capability: args.capability,
      detail: args.detail ?? "",
      actor: args.actorUserId ?? "unknown",
    });
    void auditLog(
      "dms_adapter.action_failed",
      {
        adapter_id: args.adapterId,
        provider: args.provider,
        capability: args.capability,
        detail: args.detail ?? "",
      },
      args.actorUserId,
      args.dealerId,
    );
  }
}
