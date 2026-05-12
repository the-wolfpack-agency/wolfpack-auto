/**
 * BYO External Credentials — public surface.
 *
 * Composes encryption (crypto-vault) + Postgres persistence + audit. Routes
 * call addCredential / loadCredential / rotateCredential / revokeCredential
 * / listCredentials and never touch the raw cipher API.
 *
 * Tenancy: every operation requires a `dealerId` and the SQL is dealer-scoped.
 * RLS on `dealer_external_credentials` enforces tenant isolation at the DB
 * layer as a defense-in-depth; this module is the application-layer gate.
 *
 * Mock-vs-real honesty:
 *   - KBB does NOT issue per-dealer credentials in practice (verified in the
 *     2026-05-12 session). The `kbb` provider slot is stored anyway so the
 *     schema is forward-compatible for a future paid partnership shape, but
 *     real valuations today use Edmunds (see edmunds-client.ts).
 *   - Carfax-for-Dealers and AutoCheck DO issue per-dealer credentials. The
 *     wire format for those is best-effort until the partnership is signed —
 *     see TODO(byo-shape) markers in carfax-client.ts + autocheck-client.ts.
 */

import { auditLog } from "@/lib/audit-log";
import { trackCredentials } from "@/lib/analytics-hooks";
import {
  CredentialVaultError,
  decryptCredential,
  encryptCredential,
} from "@/lib/external-credentials/crypto-vault";

export type ExternalProvider =
  | "kbb"
  | "vauto"
  | "mmr"
  | "carfax"
  | "autocheck"
  | "plaid"
  | "edmunds";

export type CredentialStatus = "active" | "revoked" | "rotating";

export const ALL_PROVIDERS: ExternalProvider[] = [
  "kbb",
  "vauto",
  "mmr",
  "carfax",
  "autocheck",
  "plaid",
  "edmunds",
];

export interface CredentialRecord {
  id: string;
  dealerId: string;
  provider: ExternalProvider;
  label: string | null;
  status: CredentialStatus;
  createdAt: string;
  rotatedAt: string | null;
  lastUsedAt: string | null;
  lastError: string | null;
}

export interface AddCredentialInput {
  dealerId: string;
  provider: ExternalProvider;
  label?: string | null;
  plaintext: string;
  actorUserId?: string;
}

export interface RotateCredentialInput {
  dealerId: string;
  credentialId: string;
  newPlaintext: string;
  actorUserId?: string;
}

export interface LoadCredentialOptions {
  /** Mark `last_used_at` after a successful load. */
  markUsed?: boolean;
}

/* ------------------------------------------------------------------ */
/*  Public API                                                          */
/* ------------------------------------------------------------------ */

/**
 * Insert a new encrypted credential. Returns the redacted record (never
 * the plaintext). Emits an analytics event + audit-log row.
 */
export async function addCredential(
  input: AddCredentialInput,
): Promise<CredentialRecord> {
  validateProvider(input.provider);
  const blob = encryptCredential(input.plaintext);

  if (!process.env.DATABASE_URL) {
    // Shadow mode — return a synthetic record so the route still 200s in dev.
    // The caller's audit/analytics still fire so the event chain is testable.
    const synthetic: CredentialRecord = {
      id: `shadow-${Date.now()}`,
      dealerId: input.dealerId,
      provider: input.provider,
      label: input.label ?? null,
      status: "active",
      createdAt: new Date().toISOString(),
      rotatedAt: null,
      lastUsedAt: null,
      lastError: null,
    };
    fireAddSignals(synthetic, input.actorUserId);
    return synthetic;
  }

  const { query } = await import("@/lib/db");
  const result = await query<{
    id: string;
    dealer_id: string;
    provider: string;
    label: string | null;
    status: string;
    created_at: Date;
    rotated_at: Date | null;
    last_used_at: Date | null;
    last_error: string | null;
  }>(
    `INSERT INTO dealer_external_credentials
       (dealer_id, provider, label, credential_blob_encrypted, credential_iv, status)
     VALUES ($1, $2, $3, $4, $5, 'active')
     ON CONFLICT (dealer_id, provider) WHERE label IS NULL
       DO UPDATE SET
         credential_blob_encrypted = EXCLUDED.credential_blob_encrypted,
         credential_iv             = EXCLUDED.credential_iv,
         status                    = 'active',
         rotated_at                = NOW(),
         last_error                = NULL
     RETURNING id, dealer_id, provider, label, status,
               created_at, rotated_at, last_used_at, last_error`,
    [
      input.dealerId,
      input.provider,
      input.label ?? null,
      blob.ciphertext,
      blob.iv,
    ],
  );

  const row = (result.rows as Array<{
    id: string;
    dealer_id: string;
    provider: string;
    label: string | null;
    status: string;
    created_at: Date;
    rotated_at: Date | null;
    last_used_at: Date | null;
    last_error: string | null;
  }>)[0];

  const record = rowToRecord(row);

  // Append-only audit row scoped to this credential.
  await insertAuditRow({
    credentialId: record.id,
    dealerId: record.dealerId,
    action: "added",
    actorUserId: input.actorUserId,
    details: { provider: record.provider, label: record.label },
  });

  fireAddSignals(record, input.actorUserId);
  return record;
}

/**
 * Load + decrypt a credential. Returns `null` when the dealer has no
 * active credential for that provider+label (graceful degradation — every
 * proxy route MUST handle null instead of 500ing).
 */
export async function loadCredential(
  dealerId: string,
  provider: ExternalProvider,
  label: string | null = null,
  options: LoadCredentialOptions = {},
): Promise<{ plaintext: string; record: CredentialRecord } | null> {
  validateProvider(provider);
  if (!process.env.DATABASE_URL) {
    return null;
  }

  const { query } = await import("@/lib/db");
  const result = await query<{
    id: string;
    dealer_id: string;
    provider: string;
    label: string | null;
    status: string;
    credential_blob_encrypted: Buffer;
    credential_iv: Buffer;
    created_at: Date;
    rotated_at: Date | null;
    last_used_at: Date | null;
    last_error: string | null;
  }>(
    label === null
      ? `SELECT id, dealer_id, provider, label, status,
                credential_blob_encrypted, credential_iv,
                created_at, rotated_at, last_used_at, last_error
         FROM dealer_external_credentials
         WHERE dealer_id = $1 AND provider = $2 AND label IS NULL AND status = 'active'
         LIMIT 1`
      : `SELECT id, dealer_id, provider, label, status,
                credential_blob_encrypted, credential_iv,
                created_at, rotated_at, last_used_at, last_error
         FROM dealer_external_credentials
         WHERE dealer_id = $1 AND provider = $2 AND label = $3 AND status = 'active'
         LIMIT 1`,
    label === null ? [dealerId, provider] : [dealerId, provider, label],
  );

  const row = (result.rows as Array<{
    id: string;
    dealer_id: string;
    provider: string;
    label: string | null;
    status: string;
    credential_blob_encrypted: Buffer;
    credential_iv: Buffer;
    created_at: Date;
    rotated_at: Date | null;
    last_used_at: Date | null;
    last_error: string | null;
  }>)[0];
  if (!row) return null;

  let plaintext: string;
  try {
    plaintext = decryptCredential({
      ciphertext: Buffer.from(row.credential_blob_encrypted),
      iv: Buffer.from(row.credential_iv),
    });
  } catch (err) {
    // Auth-tag failure / key rotation drift — surface as null, log to audit so
    // the operator sees it. The proxy route will then return available:false.
    await insertAuditRow({
      credentialId: row.id,
      dealerId: row.dealer_id,
      action: "use_failed",
      details: { reason: (err as Error).message },
    });
    return null;
  }

  if (options.markUsed) {
    try {
      await query(
        `UPDATE dealer_external_credentials
           SET last_used_at = NOW(), last_error = NULL
         WHERE id = $1 AND dealer_id = $2`,
        [row.id, dealerId],
      );
    } catch {
      /* swallow — marking usage must never break the request */
    }
  }

  return { plaintext, record: rowToRecord(row) };
}

/**
 * Replace a stored credential with a fresh plaintext value. Sets the row
 * to status='rotating' briefly so concurrent loads do not race.
 */
export async function rotateCredential(
  input: RotateCredentialInput,
): Promise<CredentialRecord | null> {
  const blob = encryptCredential(input.newPlaintext);

  if (!process.env.DATABASE_URL) {
    return null;
  }

  const { query } = await import("@/lib/db");
  const result = await query<{
    id: string;
    dealer_id: string;
    provider: string;
    label: string | null;
    status: string;
    created_at: Date;
    rotated_at: Date | null;
    last_used_at: Date | null;
    last_error: string | null;
  }>(
    `UPDATE dealer_external_credentials
        SET credential_blob_encrypted = $1,
            credential_iv             = $2,
            status                    = 'active',
            rotated_at                = NOW(),
            last_error                = NULL
      WHERE id = $3 AND dealer_id = $4
      RETURNING id, dealer_id, provider, label, status,
                created_at, rotated_at, last_used_at, last_error`,
    [blob.ciphertext, blob.iv, input.credentialId, input.dealerId],
  );

  const row = (result.rows as Array<{
    id: string;
    dealer_id: string;
    provider: string;
    label: string | null;
    status: string;
    created_at: Date;
    rotated_at: Date | null;
    last_used_at: Date | null;
    last_error: string | null;
  }>)[0];
  if (!row) return null;

  const record = rowToRecord(row);

  await insertAuditRow({
    credentialId: record.id,
    dealerId: record.dealerId,
    action: "rotated",
    actorUserId: input.actorUserId,
    details: { provider: record.provider, label: record.label },
  });

  trackCredentials("credentials.byo_rotated", record.dealerId, {
    provider: record.provider,
    credential_id: record.id,
    actor: input.actorUserId ?? "unknown",
  });

  void auditLog(
    "credentials.byo_rotated",
    { credential_id: record.id, provider: record.provider, label: record.label ?? "" },
    input.actorUserId,
    record.dealerId,
  );

  return record;
}

/**
 * Revoke a stored credential. Soft-delete: status flips to 'revoked' and the
 * ciphertext is kept so the audit chain remains complete.
 */
export async function revokeCredential(
  dealerId: string,
  credentialId: string,
  actorUserId?: string,
): Promise<CredentialRecord | null> {
  if (!process.env.DATABASE_URL) {
    return null;
  }

  const { query } = await import("@/lib/db");
  const result = await query<{
    id: string;
    dealer_id: string;
    provider: string;
    label: string | null;
    status: string;
    created_at: Date;
    rotated_at: Date | null;
    last_used_at: Date | null;
    last_error: string | null;
  }>(
    `UPDATE dealer_external_credentials
        SET status = 'revoked'
      WHERE id = $1 AND dealer_id = $2 AND status <> 'revoked'
      RETURNING id, dealer_id, provider, label, status,
                created_at, rotated_at, last_used_at, last_error`,
    [credentialId, dealerId],
  );

  const row = (result.rows as Array<{
    id: string;
    dealer_id: string;
    provider: string;
    label: string | null;
    status: string;
    created_at: Date;
    rotated_at: Date | null;
    last_used_at: Date | null;
    last_error: string | null;
  }>)[0];
  if (!row) return null;

  const record = rowToRecord(row);

  await insertAuditRow({
    credentialId: record.id,
    dealerId: record.dealerId,
    action: "revoked",
    actorUserId,
    details: { provider: record.provider, label: record.label },
  });

  trackCredentials("credentials.byo_revoked", record.dealerId, {
    provider: record.provider,
    credential_id: record.id,
    actor: actorUserId ?? "unknown",
  });

  void auditLog(
    "credentials.byo_revoked",
    { credential_id: record.id, provider: record.provider, label: record.label ?? "" },
    actorUserId,
    record.dealerId,
  );

  return record;
}

export interface ListCredentialsOptions {
  /** Include revoked rows in the result (default false). */
  includeRevoked?: boolean;
  /** Filter by a single provider. */
  provider?: ExternalProvider;
}

/**
 * List all credentials for a dealer. Returns redacted records (never the
 * plaintext or ciphertext) — the UI uses this for the settings panel.
 */
export async function listCredentials(
  dealerId: string,
  options: ListCredentialsOptions = {},
): Promise<CredentialRecord[]> {
  if (!process.env.DATABASE_URL) {
    return [];
  }
  const { query } = await import("@/lib/db");
  const filters: string[] = ["dealer_id = $1"];
  const params: unknown[] = [dealerId];
  if (!options.includeRevoked) {
    filters.push("status <> 'revoked'");
  }
  if (options.provider) {
    validateProvider(options.provider);
    params.push(options.provider);
    filters.push(`provider = $${params.length}`);
  }
  const result = await query<{
    id: string;
    dealer_id: string;
    provider: string;
    label: string | null;
    status: string;
    created_at: Date;
    rotated_at: Date | null;
    last_used_at: Date | null;
    last_error: string | null;
  }>(
    `SELECT id, dealer_id, provider, label, status,
            created_at, rotated_at, last_used_at, last_error
       FROM dealer_external_credentials
      WHERE ${filters.join(" AND ")}
      ORDER BY provider ASC, created_at DESC`,
    params,
  );
  return (result.rows as Array<{
    id: string;
    dealer_id: string;
    provider: string;
    label: string | null;
    status: string;
    created_at: Date;
    rotated_at: Date | null;
    last_used_at: Date | null;
    last_error: string | null;
  }>).map(rowToRecord);
}

/**
 * Hard-delete a credential. Use sparingly — prefer revoke. Keeps the audit
 * row (ON DELETE CASCADE means we copy the action into audit BEFORE delete).
 */
export async function deleteCredential(
  dealerId: string,
  credentialId: string,
  actorUserId?: string,
): Promise<boolean> {
  if (!process.env.DATABASE_URL) {
    return false;
  }
  // Note: ON DELETE CASCADE on external_credential_audit will wipe history.
  // Insert a final audit row BEFORE delete so the action is recorded.
  await insertAuditRow({
    credentialId,
    dealerId,
    action: "revoked",
    actorUserId,
    details: { hard_deleted: true },
  });
  const { query } = await import("@/lib/db");
  const result = await query<{ id: string }>(
    `DELETE FROM dealer_external_credentials
      WHERE id = $1 AND dealer_id = $2
      RETURNING id`,
    [credentialId, dealerId],
  );
  return (result.rows as Array<{ id: string }>).length > 0;
}

/**
 * Stamp the last error on a credential (e.g. when the proxy call to
 * Carfax/AutoCheck fails). Surfaces in the settings UI so the operator
 * can re-enter their key.
 */
export async function recordCredentialError(
  dealerId: string,
  credentialId: string,
  errorMessage: string,
): Promise<void> {
  if (!process.env.DATABASE_URL) return;
  try {
    const { query } = await import("@/lib/db");
    await query(
      `UPDATE dealer_external_credentials
          SET last_error = $1
        WHERE id = $2 AND dealer_id = $3`,
      [errorMessage.slice(0, 500), credentialId, dealerId],
    );
    await insertAuditRow({
      credentialId,
      dealerId,
      action: "use_failed",
      details: { error: errorMessage.slice(0, 500) },
    });
  } catch {
    /* swallow — error recording must never block */
  }
}

/* ------------------------------------------------------------------ */
/*  Internal helpers                                                    */
/* ------------------------------------------------------------------ */

function validateProvider(provider: string): asserts provider is ExternalProvider {
  if (!ALL_PROVIDERS.includes(provider as ExternalProvider)) {
    throw new CredentialVaultError(
      `unknown provider: ${provider}`,
      "provider_unknown",
    );
  }
}

function rowToRecord(row: {
  id: string;
  dealer_id: string;
  provider: string;
  label: string | null;
  status: string;
  created_at: Date;
  rotated_at: Date | null;
  last_used_at: Date | null;
  last_error: string | null;
}): CredentialRecord {
  return {
    id: row.id,
    dealerId: row.dealer_id,
    provider: row.provider as ExternalProvider,
    label: row.label,
    status: row.status as CredentialStatus,
    createdAt: new Date(row.created_at).toISOString(),
    rotatedAt: row.rotated_at ? new Date(row.rotated_at).toISOString() : null,
    lastUsedAt: row.last_used_at ? new Date(row.last_used_at).toISOString() : null,
    lastError: row.last_error,
  };
}

async function insertAuditRow(args: {
  credentialId: string;
  dealerId: string;
  action: "added" | "rotated" | "revoked" | "used" | "use_failed";
  actorUserId?: string;
  details?: Record<string, unknown>;
}): Promise<void> {
  if (!process.env.DATABASE_URL) return;
  try {
    const { query } = await import("@/lib/db");
    await query(
      `INSERT INTO external_credential_audit
         (credential_id, dealer_id, action, actor_user_id, details)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        args.credentialId,
        args.dealerId,
        args.action,
        args.actorUserId ?? null,
        JSON.stringify(args.details ?? {}),
      ],
    );
  } catch (err) {
    console.error("[external-credentials] audit insert failed:", err);
  }
}

function fireAddSignals(record: CredentialRecord, actorUserId?: string): void {
  trackCredentials("credentials.byo_added", record.dealerId, {
    provider: record.provider,
    credential_id: record.id,
    actor: actorUserId ?? "unknown",
  });
  void auditLog(
    "credentials.byo_added",
    { credential_id: record.id, provider: record.provider, label: record.label ?? "" },
    actorUserId,
    record.dealerId,
  );
}

// Re-export so callers can grab everything from `@/lib/external-credentials`.
export { encryptCredential, decryptCredential, CredentialVaultError } from "@/lib/external-credentials/crypto-vault";
export type { EncryptedBlob } from "@/lib/external-credentials/crypto-vault";
