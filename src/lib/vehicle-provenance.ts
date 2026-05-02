/**
 * Vehicle-provenance ledger — Carfax-killer.
 *
 * Append-only, hash-chained, cryptographically-signed event log per VIN.
 * Every event is signed via the named-algorithm registry in
 * `src/lib/crypto/sign.ts` so we can rotate (or migrate to PQ) without
 * touching call sites.
 *
 * Hash semantics
 * --------------
 * Each leaf hash is SHA-256 of:
 *   prev_hash || canonical_json(payload) || occurred_at_iso
 *
 * `prev_hash` is the empty string for the genesis row of a VIN. That makes
 * every chain a deterministic, reproducible derivation from the public
 * inputs; tampering with a payload changes that row's hash, which breaks
 * every downstream row's prev_hash linkage. `verifyChain` walks the ledger
 * and re-computes every leaf, asserting linkage AND signature integrity.
 *
 * Optimistic-lock pattern
 * -----------------------
 * The events table has UNIQUE (vin, prev_hash). Two concurrent writers
 * cannot both extend the chain at the same tip — the second INSERT
 * fails with a unique violation, the caller retries. This is the same
 * spirit as `src/lib/optimistic-lock.ts` (DB-enforced concurrent-edit
 * detection) but expressed at the row-uniqueness layer.
 *
 * Triple-write
 * ------------
 * Every recorded event fans out to Qdrant (vector / metadata point) and
 * Neo4j (`(:Vehicle)-[:HAS_EVENT]->(:ProvenanceEvent)`) via
 * `writeEventsToSecondaryStores`. Postgres is the source of truth; the
 * fan-out NEVER throws — secondary stores degraded counts to a
 * `system.triple_write_degraded`-style log line.
 */

import crypto from "node:crypto";
import { query, pool, setTenantContext } from "@/lib/db";
import { signBytes, verifyBytes } from "@/lib/crypto/sign";
import { CURRENT_SIGN_ALGORITHM } from "@/lib/crypto/algorithms";
import type { AlgorithmId } from "@/lib/crypto/algorithms";
import { trackProvenance } from "@/lib/analytics-hooks";
import { writeEventsToSecondaryStores } from "@/lib/triple-write";
import type { AnalyticsEvent } from "@/lib/analytics-engine";

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

export type ProvenanceEventType =
  | "title_transfer"
  | "odometer_reading"
  | "service"
  | "damage"
  | "recall"
  | "inspection";

export const PROVENANCE_EVENT_TYPES: readonly ProvenanceEventType[] = [
  "title_transfer",
  "odometer_reading",
  "service",
  "damage",
  "recall",
  "inspection",
] as const;

export interface ProvenanceEventRow {
  id: string;
  dealer_id: string;
  vin: string;
  event_type: ProvenanceEventType;
  occurred_at: string;
  payload: Record<string, unknown>;
  recorded_at: string;
  recorded_by_user_id: string | null;
  prev_hash: string | null;
  this_hash: string;
  signature_alg: AlgorithmId;
  signature_b64: string;
  verifying_key_id: string | null;
}

export interface ProvenanceAnchorRow {
  id: string;
  dealer_id: string;
  vin: string;
  root_hash: string;
  range_start_id: string;
  range_end_id: string;
  range_count: number;
  anchored_at: string;
  anchor_alg: AlgorithmId;
  anchor_signature: string;
  verifying_key_id: string | null;
}

export interface VerifyChainResult {
  ok: boolean;
  /** Total events walked (0 means no chain exists for the VIN). */
  count: number;
  /** ID of the first row whose hash or signature failed. */
  brokenAtId?: string;
  reason?: string;
}

/* -------------------------------------------------------------------------- */
/* Hashing                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Canonical JSON serializer — keys sorted recursively so equivalent
 * objects always serialize byte-identically. This is what the hash
 * commits to; `JSON.stringify(payload)` alone is not stable across
 * key-insertion order and would invalidate the chain on benign re-saves.
 */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((v) => canonicalJson(v)).join(",")}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  const body = keys
    .map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`)
    .join(",");
  return `{${body}}`;
}

/**
 * Compute the leaf hash for a row. `prevHash` is `""` for the genesis row
 * of a VIN — never `null` — so verifiers don't have to special-case it.
 */
export function computeLeafHash(args: {
  prevHash: string | null;
  payload: Record<string, unknown>;
  occurredAt: string;
}): string {
  const prev = args.prevHash ?? "";
  const canon = canonicalJson(args.payload);
  const input = `${prev}||${canon}||${args.occurredAt}`;
  return crypto.createHash("sha256").update(input, "utf8").digest("hex");
}

/* -------------------------------------------------------------------------- */
/* recordEvent                                                                */
/* -------------------------------------------------------------------------- */

export interface RecordEventArgs {
  dealerId: string;
  vin: string;
  eventType: ProvenanceEventType;
  occurredAt: string | Date;
  payload: Record<string, unknown>;
  recordedByUserId?: string | null;
  algorithm?: AlgorithmId;
  /** Optional opaque identifier of the verifying key (rotation aid). */
  verifyingKeyId?: string;
}

/**
 * Append a new event to the ledger for a VIN.
 *
 * Concurrency: relies on the DB's UNIQUE (vin, prev_hash) constraint.
 * Two writers racing the same tip lose deterministically — the second
 * INSERT throws, caller retries (mirroring `optimistic-lock.ts`).
 *
 * The signature is detached: we sign the leaf hash only, so a 3rd-party
 * verifier doesn't need to re-canonicalise the payload to verify the
 * signature, only re-derive the hash from the public payload + prev_hash
 * and check the signature against the public key.
 */
export async function recordEvent(
  args: RecordEventArgs,
): Promise<ProvenanceEventRow> {
  const occurredAtIso =
    args.occurredAt instanceof Date
      ? args.occurredAt.toISOString()
      : new Date(args.occurredAt).toISOString();

  const { rows: tipRows } = await query<{ this_hash: string }>(
    `SELECT this_hash
       FROM vehicle_provenance_events
      WHERE vin = $1
      ORDER BY recorded_at DESC, this_hash DESC
      LIMIT 1`,
    [args.vin],
  );
  const prevHash = tipRows[0]?.this_hash ?? null;

  const thisHash = computeLeafHash({
    prevHash,
    payload: args.payload,
    occurredAt: occurredAtIso,
  });

  const algorithm: AlgorithmId = args.algorithm ?? CURRENT_SIGN_ALGORITHM;
  const { signatureB64, algorithm: actualAlg } = signBytes(thisHash, {
    algorithm,
  });

  const insert = await query<ProvenanceEventRow>(
    `INSERT INTO vehicle_provenance_events (
       dealer_id, vin, event_type, occurred_at, payload,
       recorded_by_user_id, prev_hash, this_hash,
       signature_alg, signature_b64, verifying_key_id
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING id, dealer_id, vin, event_type, occurred_at, payload,
               recorded_at, recorded_by_user_id, prev_hash, this_hash,
               signature_alg, signature_b64, verifying_key_id`,
    [
      args.dealerId,
      args.vin,
      args.eventType,
      occurredAtIso,
      JSON.stringify(args.payload),
      args.recordedByUserId ?? null,
      prevHash,
      thisHash,
      actualAlg,
      signatureB64,
      args.verifyingKeyId ?? null,
    ],
  );

  const row = insert.rows[0];

  // Analytics — tied to every feature, never blocking
  try {
    trackProvenance("provenance.event_recorded", args.dealerId, {
      vin: args.vin,
      event_type: args.eventType,
      algorithm: actualAlg,
      has_prev: prevHash !== null,
    });
  } catch {
    /* analytics must never throw */
  }

  // Triple-write fan-out — Postgres is already done; secondary stores
  // run fire-and-forget. Failures are swallowed by writeEventsToSecondaryStores.
  try {
    const analytics: AnalyticsEvent = {
      event_type: "provenance",
      action: "provenance.event_recorded",
      page: `/api/admin/vehicle-provenance/${args.vin}`,
      session_id: `provenance:${args.vin}`,
      user_fingerprint: args.recordedByUserId ?? "system",
      timestamp: row.recorded_at,
      metadata: {
        dealer_id: args.dealerId,
        vin: args.vin,
        event_type: args.eventType,
        this_hash: thisHash,
        prev_hash: prevHash,
        signature_alg: actualAlg,
        payload_text: canonicalJson(args.payload),
        relationship: "Vehicle-HAS_EVENT-ProvenanceEvent",
      },
    };
    await writeEventsToSecondaryStores([analytics]);
  } catch (err) {
    // Belt-and-suspenders: writeEventsToSecondaryStores already swallows,
    // but if it ever changes we still don't want to fail the primary write.
    console.warn(
      "[vehicle-provenance] secondary-store fan-out failed (non-blocking):",
      err instanceof Error ? err.message : String(err),
    );
  }

  return normaliseEventRow(row);
}

/* -------------------------------------------------------------------------- */
/* verifyChain                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Re-walk the chain for a VIN, asserting every leaf hash links to its
 * predecessor AND every signature still verifies.
 *
 * Returns `{ ok: false, brokenAtId, reason }` for the first failure
 * encountered. An empty chain returns `{ ok: true, count: 0 }` (no chain
 * = nothing to break) — callers that want "must exist" should check
 * `count > 0` themselves.
 */
export async function verifyChain(vin: string): Promise<VerifyChainResult> {
  const { rows } = await query<ProvenanceEventRow>(
    `SELECT id, dealer_id, vin, event_type, occurred_at, payload,
            recorded_at, recorded_by_user_id, prev_hash, this_hash,
            signature_alg, signature_b64, verifying_key_id
       FROM vehicle_provenance_events
      WHERE vin = $1
      ORDER BY recorded_at ASC, this_hash ASC`,
    [vin],
  );

  if (rows.length === 0) {
    return { ok: true, count: 0 };
  }

  let expectedPrev: string | null = null;
  for (const raw of rows) {
    const row = normaliseEventRow(raw);

    if (row.prev_hash !== expectedPrev) {
      return {
        ok: false,
        count: rows.length,
        brokenAtId: row.id,
        reason: `prev_hash mismatch: expected ${expectedPrev ?? "(genesis)"}, got ${row.prev_hash ?? "(null)"}`,
      };
    }

    const occurredAtIso = new Date(row.occurred_at).toISOString();
    const expectedHash = computeLeafHash({
      prevHash: row.prev_hash,
      payload: row.payload,
      occurredAt: occurredAtIso,
    });

    if (expectedHash !== row.this_hash) {
      return {
        ok: false,
        count: rows.length,
        brokenAtId: row.id,
        reason: "this_hash does not match recomputed leaf (payload tampered)",
      };
    }

    const sigOk = verifyBytes(row.this_hash, row.signature_b64, row.signature_alg);
    if (!sigOk) {
      return {
        ok: false,
        count: rows.length,
        brokenAtId: row.id,
        reason: "signature failed verification",
      };
    }

    expectedPrev = row.this_hash;
  }

  return { ok: true, count: rows.length };
}

/* -------------------------------------------------------------------------- */
/* anchorRange — merkle root over a contiguous slice of the chain             */
/* -------------------------------------------------------------------------- */

/**
 * Compute a SHA-256 merkle root over a list of leaf hex strings.
 *
 * Convention: hashes concatenated as raw bytes, odd-final-leaf duplicated
 * (Bitcoin / RFC-6962-style). Stable; deterministic; verifiable by anyone
 * with the leaves in order.
 */
export function merkleRoot(leaves: string[]): string {
  if (leaves.length === 0) {
    return crypto.createHash("sha256").update("").digest("hex");
  }
  // Single-leaf root = SHA-256(leaf || leaf) so root != leaf — a 3rd-party
  // verifier should never confuse "root for a 1-event chain" with the leaf
  // hash itself.
  if (leaves.length === 1) {
    const buf = Buffer.from(leaves[0], "hex");
    return crypto.createHash("sha256").update(Buffer.concat([buf, buf])).digest("hex");
  }
  /* Cast through Uint8Array — Buffer's stricter ArrayBuffer-typed
     overload (Node 22+) collides with Buffer.concat / digest() output;
     Uint8Array satisfies both without runtime change. */
  let layer: Uint8Array[] = leaves.map((h) => Buffer.from(h, "hex"));
  while (layer.length > 1) {
    const next: Uint8Array[] = [];
    for (let i = 0; i < layer.length; i += 2) {
      const a = layer[i];
      const b = i + 1 < layer.length ? layer[i + 1] : layer[i]; // dup last on odd
      next.push(
        crypto.createHash("sha256").update(Buffer.concat([a, b])).digest(),
      );
    }
    layer = next;
  }
  return Buffer.from(layer[0]).toString("hex");
}

export async function anchorRange(args: {
  dealerId: string;
  vin: string;
  fromId?: string;
  toId?: string;
  algorithm?: AlgorithmId;
}): Promise<ProvenanceAnchorRow> {
  // Pull the leaves in chain order. If fromId / toId omitted, anchor the
  // entire chain — the common "anchor everything to date" admin action.
  const conditions: string[] = ["vin = $1"];
  const params: unknown[] = [args.vin];

  // Bound by recorded_at of from/to rows so the slice is contiguous in
  // chain order. Two queries (one for the bounding timestamps, one for
  // the slice) so the slice query stays a simple range scan.
  let fromTs: string | null = null;
  let toTs: string | null = null;

  if (args.fromId) {
    const { rows } = await query<{ recorded_at: string }>(
      `SELECT recorded_at FROM vehicle_provenance_events WHERE id = $1 AND vin = $2`,
      [args.fromId, args.vin],
    );
    if (rows.length === 0) throw new Error(`fromId not found for vin: ${args.fromId}`);
    fromTs = rows[0].recorded_at;
  }
  if (args.toId) {
    const { rows } = await query<{ recorded_at: string }>(
      `SELECT recorded_at FROM vehicle_provenance_events WHERE id = $1 AND vin = $2`,
      [args.toId, args.vin],
    );
    if (rows.length === 0) throw new Error(`toId not found for vin: ${args.toId}`);
    toTs = rows[0].recorded_at;
  }

  if (fromTs) {
    params.push(fromTs);
    conditions.push(`recorded_at >= $${params.length}`);
  }
  if (toTs) {
    params.push(toTs);
    conditions.push(`recorded_at <= $${params.length}`);
  }

  const where = `WHERE ${conditions.join(" AND ")}`;
  const { rows: leaves } = await query<{ id: string; this_hash: string }>(
    `SELECT id, this_hash
       FROM vehicle_provenance_events
       ${where}
       ORDER BY recorded_at ASC, this_hash ASC`,
    params,
  );

  if (leaves.length === 0) {
    throw new Error(`anchorRange: no events found for vin ${args.vin}`);
  }

  const root = merkleRoot(leaves.map((l) => l.this_hash));
  const algorithm = args.algorithm ?? CURRENT_SIGN_ALGORITHM;
  const { signatureB64 } = signBytes(root, { algorithm });

  const insert = await query<ProvenanceAnchorRow>(
    `INSERT INTO vehicle_provenance_anchors (
       dealer_id, vin, root_hash, range_start_id, range_end_id,
       range_count, anchor_alg, anchor_signature
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id, dealer_id, vin, root_hash, range_start_id, range_end_id,
               range_count, anchored_at, anchor_alg, anchor_signature, verifying_key_id`,
    [
      args.dealerId,
      args.vin,
      root,
      leaves[0].id,
      leaves[leaves.length - 1].id,
      leaves.length,
      algorithm,
      signatureB64,
    ],
  );

  try {
    trackProvenance("provenance.anchor_created", args.dealerId, {
      vin: args.vin,
      range_count: leaves.length,
      algorithm,
    });
  } catch {
    /* analytics must never throw */
  }

  return insert.rows[0];
}

/* -------------------------------------------------------------------------- */
/* Listing / summary                                                          */
/* -------------------------------------------------------------------------- */

export async function listEvents(
  vin: string,
  opts?: { limit?: number; offset?: number },
): Promise<ProvenanceEventRow[]> {
  const limit = Math.min(opts?.limit ?? 100, 500);
  const offset = Math.max(opts?.offset ?? 0, 0);
  const { rows } = await query<ProvenanceEventRow>(
    `SELECT id, dealer_id, vin, event_type, occurred_at, payload,
            recorded_at, recorded_by_user_id, prev_hash, this_hash,
            signature_alg, signature_b64, verifying_key_id
       FROM vehicle_provenance_events
      WHERE vin = $1
      ORDER BY recorded_at ASC, this_hash ASC
      LIMIT $2 OFFSET $3`,
    [vin, limit, offset],
  );
  return rows.map(normaliseEventRow);
}

export async function listAnchors(vin: string): Promise<ProvenanceAnchorRow[]> {
  const { rows } = await query<ProvenanceAnchorRow>(
    `SELECT id, dealer_id, vin, root_hash, range_start_id, range_end_id,
            range_count, anchored_at, anchor_alg, anchor_signature, verifying_key_id
       FROM vehicle_provenance_anchors
      WHERE vin = $1
      ORDER BY anchored_at DESC`,
    [vin],
  );
  return rows;
}

export async function getProvenanceSummary(vin: string): Promise<{
  vin: string;
  count: number;
  last_event_at: string | null;
  last_hash: string | null;
  last_alg: AlgorithmId | null;
  events: ProvenanceEventRow[];
  anchors: ProvenanceAnchorRow[];
  verification: VerifyChainResult;
}> {
  const events = await listEvents(vin);
  const anchors = await listAnchors(vin);
  const verification = await verifyChain(vin);
  const last = events[events.length - 1];
  return {
    vin,
    count: events.length,
    last_event_at: last?.recorded_at ?? null,
    last_hash: last?.this_hash ?? null,
    last_alg: (last?.signature_alg as AlgorithmId | undefined) ?? null,
    events,
    anchors,
    verification,
  };
}

/* -------------------------------------------------------------------------- */
/* Tenant-scoped helpers (use when RLS context is available)                  */
/* -------------------------------------------------------------------------- */

/**
 * Run a callback under a tenant-scoped transaction so RLS policies on
 * provenance tables filter by `app.current_dealer_id`. Mirrors the
 * usage pattern in `setTenantContext` (see src/lib/db.ts).
 */
export async function withTenantTx<T>(
  dealerId: string,
  fn: (clientQuery: (text: string, params?: unknown[]) => Promise<unknown>) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await setTenantContext(client, dealerId);
    const wrapped = (text: string, params?: unknown[]) => client.query(text, params);
    const result = await fn(wrapped);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    try { await client.query("ROLLBACK"); } catch {}
    throw err;
  } finally {
    client.release();
  }
}

/* -------------------------------------------------------------------------- */
/* Internal                                                                   */
/* -------------------------------------------------------------------------- */

function normaliseEventRow(row: ProvenanceEventRow): ProvenanceEventRow {
  // Postgres returns JSONB as a parsed object already, but if a caller
  // (or tests) hand a JSON string in we coerce. Idempotent.
  let payload: Record<string, unknown>;
  if (typeof row.payload === "string") {
    try {
      payload = JSON.parse(row.payload) as Record<string, unknown>;
    } catch {
      payload = {};
    }
  } else {
    payload = row.payload ?? {};
  }
  return { ...row, payload };
}
