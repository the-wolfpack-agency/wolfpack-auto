/**
 * Unit tests for src/lib/leads/intake.ts
 */

import {
  findDuplicate,
  ingestLead,
  IntakeValidationFailure,
  validateIntake,
  type DedupCandidate,
} from "../intake";
import type { LeadIntakePayload } from "../types";

const basePayload: LeadIntakePayload = {
  first_name: "Alex",
  last_name: "Rivera",
  email: "Alex.Rivera@example.com",
  phone: "+1 555 123 4567",
  vehicle_interest: "2024 Toyota Camry",
  source_name: "Website webhook",
  source_type: "webhook",
};

describe("validateIntake", () => {
  it("returns no errors for a valid payload", () => {
    expect(validateIntake(basePayload)).toEqual([]);
  });

  it("flags missing first/last name", () => {
    const errs = validateIntake({ ...basePayload, first_name: "", last_name: "" });
    expect(errs.map((e) => e.field).sort()).toEqual(["first_name", "last_name"]);
  });

  it("flags bad email", () => {
    const errs = validateIntake({ ...basePayload, email: "not-an-email" });
    expect(errs.some((e) => e.field === "email")).toBe(true);
  });

  it("flags bad source_type", () => {
    const errs = validateIntake({ ...basePayload, source_type: "carrier-pigeon" as never });
    expect(errs.some((e) => e.field === "source_type")).toBe(true);
  });

  it("flags too-short phone but allows null", () => {
    const errsShort = validateIntake({ ...basePayload, phone: "123" });
    expect(errsShort.some((e) => e.field === "phone")).toBe(true);
    const errsNull = validateIntake({ ...basePayload, phone: null });
    expect(errsNull.some((e) => e.field === "phone")).toBe(false);
  });
});

describe("findDuplicate", () => {
  const existing: DedupCandidate[] = [
    {
      id: "lead-1",
      email: "alex.rivera@example.com",
      phone: "+15551234567",
      vehicle_interest: "2024 Toyota Camry",
    },
    {
      id: "lead-2",
      email: "kim@example.com",
      phone: null,
      vehicle_interest: "2025 Ford F-150",
    },
  ];

  it("matches by email + vehicle case-insensitively", () => {
    expect(
      findDuplicate(
        { email: "ALEX.RIVERA@example.com", phone: null, vehicle_interest: "2024 toyota camry" },
        existing,
      ),
    ).toBe("lead-1");
  });

  it("matches by phone + vehicle even with formatting differences", () => {
    expect(
      findDuplicate(
        { email: "different@example.com", phone: "(555) 123-4567", vehicle_interest: "2024 Toyota Camry" },
        existing,
      ),
    ).toBe("lead-1");
  });

  it("does NOT match when vehicle differs", () => {
    expect(
      findDuplicate(
        { email: "alex.rivera@example.com", phone: null, vehicle_interest: "2025 Honda Civic" },
        existing,
      ),
    ).toBeNull();
  });

  it("returns null when no candidates match", () => {
    expect(
      findDuplicate(
        { email: "nope@example.com", phone: null, vehicle_interest: "2025 Honda Civic" },
        existing,
      ),
    ).toBeNull();
  });
});

describe("ingestLead", () => {
  it("persists a fresh lead and returns its id", async () => {
    const persisted: { id: string; created_at: string } = {
      id: "db-lead-99",
      created_at: "2026-05-11T00:00:00.000Z",
    };
    const persist = jest.fn().mockResolvedValue(persisted);
    const fetchCandidates = jest.fn().mockResolvedValue([]);

    const result = await ingestLead(basePayload, {
      dealerId: "dealer-1",
      fetchCandidates,
      persist,
      idFactory: () => "tmp-id",
      now: () => new Date("2026-05-11T00:00:00.000Z"),
    });

    expect(result.duplicate).toBe(false);
    expect(result.lead.id).toBe("db-lead-99");
    expect(result.lead.dealer_id).toBe("dealer-1");
    expect(result.lead.email).toBe("alex.rivera@example.com");
    expect(persist).toHaveBeenCalledTimes(1);
  });

  it("returns duplicate when an existing lead matches by email+vehicle", async () => {
    const persist = jest.fn();
    const fetchCandidates = jest.fn().mockResolvedValue([
      {
        id: "existing-1",
        email: "alex.rivera@example.com",
        phone: null,
        vehicle_interest: "2024 Toyota Camry",
      },
    ] as DedupCandidate[]);

    const result = await ingestLead(basePayload, {
      dealerId: "dealer-1",
      fetchCandidates,
      persist,
    });

    expect(result.duplicate).toBe(true);
    expect(result.matched_lead_id).toBe("existing-1");
    expect(persist).not.toHaveBeenCalled();
  });

  it("throws IntakeValidationFailure on invalid payload", async () => {
    const persist = jest.fn();
    const fetchCandidates = jest.fn().mockResolvedValue([]);
    await expect(
      ingestLead(
        { ...basePayload, email: "not-email" },
        { dealerId: "dealer-1", fetchCandidates, persist },
      ),
    ).rejects.toBeInstanceOf(IntakeValidationFailure);
    expect(persist).not.toHaveBeenCalled();
  });
});
