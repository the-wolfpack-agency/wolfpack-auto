/**
 * Modern lead intake — pure-function core.
 *
 * The route handler validates + auths the request, then hands the payload
 * to `ingestLead`. Side-effects (DB writes, dedup queries) are injected so
 * tests can drive the function without a database.
 *
 * Persistence is handled inside the injected `persist` callback. This keeps
 * `ingestLead` deterministic and testable.
 */

import type {
  IngestResult,
  LeadIntakePayload,
  LeadSourceType,
  NormalizedLead,
} from "./types";

/* -------------------------------------------------------------------------- */
/* Normalization                                                              */
/* -------------------------------------------------------------------------- */

function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 7) return null;
  // Drop a leading country-code 1 so 10-digit and 11-digit US numbers
  // compare equal. Keeps phone dedup tolerant of formatting differences.
  const compact = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  return compact;
}

function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

function normalizeVehicleInterest(raw: string): string {
  return raw.trim().replace(/\s+/g, " ").toLowerCase();
}

/* -------------------------------------------------------------------------- */
/* Validation                                                                 */
/* -------------------------------------------------------------------------- */

export interface IntakeValidationError {
  field: string;
  message: string;
}

/**
 * Validate the intake payload. Returns the list of errors; empty = ok.
 * Pure function — no I/O.
 */
export function validateIntake(payload: Partial<LeadIntakePayload>): IntakeValidationError[] {
  const errs: IntakeValidationError[] = [];
  if (!payload.first_name || payload.first_name.trim().length === 0) {
    errs.push({ field: "first_name", message: "First name is required" });
  }
  if (!payload.last_name || payload.last_name.trim().length === 0) {
    errs.push({ field: "last_name", message: "Last name is required" });
  }
  if (!payload.email || !/^\S+@\S+\.\S+$/.test(payload.email)) {
    errs.push({ field: "email", message: "Valid email is required" });
  }
  if (!payload.vehicle_interest || payload.vehicle_interest.trim().length === 0) {
    errs.push({ field: "vehicle_interest", message: "Vehicle of interest is required" });
  }
  if (
    !payload.source_type ||
    !(["webhook", "api", "email", "manual"] as LeadSourceType[]).includes(payload.source_type)
  ) {
    errs.push({ field: "source_type", message: "source_type must be webhook | api | email | manual" });
  }
  if (!payload.source_name || payload.source_name.trim().length === 0) {
    errs.push({ field: "source_name", message: "source_name is required" });
  }
  if (payload.phone && normalizePhone(payload.phone) === null) {
    errs.push({ field: "phone", message: "Phone must contain at least 7 digits" });
  }
  return errs;
}

/* -------------------------------------------------------------------------- */
/* Dedup                                                                      */
/* -------------------------------------------------------------------------- */

/** Stored lead shape used for dedup comparison. */
export interface DedupCandidate {
  id: string;
  email: string;
  phone: string | null;
  vehicle_interest: string;
}

/**
 * Match an incoming lead against existing candidates.
 * Match rules: (email + vehicle_interest) OR (phone + vehicle_interest).
 * Returns the matched lead's id or null. Pure function.
 */
export function findDuplicate(
  candidate: { email: string; phone: string | null; vehicle_interest: string },
  existing: DedupCandidate[],
): string | null {
  const email = normalizeEmail(candidate.email);
  const phone = normalizePhone(candidate.phone);
  const vehicle = normalizeVehicleInterest(candidate.vehicle_interest);

  for (const other of existing) {
    const otherEmail = normalizeEmail(other.email);
    const otherPhone = normalizePhone(other.phone);
    const otherVehicle = normalizeVehicleInterest(other.vehicle_interest);
    if (vehicle && otherVehicle && vehicle === otherVehicle) {
      if (email && email === otherEmail) return other.id;
      if (phone && phone === otherPhone) return other.id;
    }
  }
  return null;
}

/* -------------------------------------------------------------------------- */
/* Ingestion                                                                  */
/* -------------------------------------------------------------------------- */

export interface IngestDeps {
  /** Dealer to scope writes against. */
  dealerId: string;
  /** Fetch recent dedup candidates for this dealer. */
  fetchCandidates: () => Promise<DedupCandidate[]>;
  /** Persist a freshly-normalized lead and return its id + created_at. */
  persist: (lead: NormalizedLead) => Promise<{ id: string; created_at: string }>;
  /** Override id generator — useful in tests. */
  idFactory?: () => string;
  /** Override timestamp — useful in tests. */
  now?: () => Date;
}

function defaultId(): string {
  // Match Postgres uuid-v4 shape — but generated client-side for the in-memory
  // path. The persist() callback may replace this with the canonical DB id.
  return `lead-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Validate → dedup → persist. Pure with respect to inputs except via deps.
 */
export async function ingestLead(
  payload: LeadIntakePayload,
  deps: IngestDeps,
): Promise<IngestResult> {
  const errors = validateIntake(payload);
  if (errors.length > 0) {
    throw new IntakeValidationFailure(errors);
  }

  const now = (deps.now?.() ?? new Date()).toISOString();
  const idGen = deps.idFactory ?? defaultId;

  const candidates = await deps.fetchCandidates();
  const matchedId = findDuplicate(
    {
      email: payload.email,
      phone: payload.phone,
      vehicle_interest: payload.vehicle_interest,
    },
    candidates,
  );

  if (matchedId) {
    const dup: NormalizedLead = {
      id: matchedId,
      dealer_id: deps.dealerId,
      first_name: payload.first_name.trim(),
      last_name: payload.last_name.trim(),
      email: normalizeEmail(payload.email),
      phone: normalizePhone(payload.phone),
      vehicle_interest: payload.vehicle_interest.trim(),
      source_name: payload.source_name.trim(),
      source_type: payload.source_type,
      created_at: now,
    };
    return { lead: dup, duplicate: true, matched_lead_id: matchedId };
  }

  const draft: NormalizedLead = {
    id: idGen(),
    dealer_id: deps.dealerId,
    first_name: payload.first_name.trim(),
    last_name: payload.last_name.trim(),
    email: normalizeEmail(payload.email),
    phone: normalizePhone(payload.phone),
    vehicle_interest: payload.vehicle_interest.trim(),
    source_name: payload.source_name.trim(),
    source_type: payload.source_type,
    created_at: now,
  };

  const persisted = await deps.persist(draft);
  return {
    lead: { ...draft, id: persisted.id, created_at: persisted.created_at },
    duplicate: false,
    matched_lead_id: null,
  };
}

export class IntakeValidationFailure extends Error {
  constructor(public readonly errors: IntakeValidationError[]) {
    super(`Lead intake validation failed: ${errors.map((e) => e.field).join(", ")}`);
    this.name = "IntakeValidationFailure";
  }
}
