/**
 * Unit tests for connected-vehicle telemetry intake.
 *
 * Covered:
 *   - verifyAndIngest: missing signature, valid signature, invalid signature,
 *     idempotency on duplicate provider event id, vin mismatch, unregistered
 *     device.
 *   - runMaintenanceRules: oil_life, brake_wear, battery, fault_code (general
 *     dtc), low tire_pressure across 2+ tires, mileage milestone, dedupe
 *     within 30 days.
 *   - Triple-write degrades gracefully when secondary stores throw.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-require-imports */

const mockQuery = jest.fn();

jest.mock("@/lib/db", () => ({
  query: (...args: unknown[]) => mockQuery(...args),
}));

const mockTrackServerEvent = jest.fn().mockResolvedValue(undefined);
jest.mock("@/lib/analytics", () => ({
  trackServerEvent: (...args: any[]) => mockTrackServerEvent(...args),
}));

const mockWriteSecondary = jest
  .fn()
  .mockResolvedValue({ qdrant: 0, neo4j: 0 });
jest.mock("@/lib/triple-write", () => ({
  writeEventsToSecondaryStores: (...args: any[]) =>
    mockWriteSecondary(...args),
}));

jest.mock("@/lib/crypto", () => ({
  decryptPII: (s: string) => s,
}));

import {
  __testing,
  connectVehicle,
  dismissLead,
  listLeadsForDealer,
  markLeadCompleted,
  runMaintenanceRules,
  verifyAndIngest,
} from "@/lib/connected-vehicle";

const SECRET = "test-secret-shhh";
const DEALER = "00000000-0000-4000-a000-000000000001";
const CUSTOMER = "00000000-0000-4000-b000-000000000001";
const CV_ID = "00000000-0000-4000-c000-000000000001";
const VIN = "1HGBH41JXMN109186";

const baseLink = {
  id: CV_ID,
  dealer_id: DEALER,
  customer_id: CUSTOMER,
  vin: VIN,
};

function buildBody(
  override: Partial<{
    vin: string;
    provider_device_id: string;
    signals: any[];
  }> = {},
) {
  return JSON.stringify({
    vin: override.vin ?? VIN,
    provider_device_id: override.provider_device_id ?? "device-1",
    signals:
      override.signals ?? [
        {
          event_id: "evt-1",
          recorded_at: new Date().toISOString(),
          signal_type: "oil_life",
          value: 12,
        },
      ],
  });
}

function sign(raw: string): string {
  return __testing.signRawBody(SECRET, raw);
}

describe("verifyAndIngest", () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockTrackServerEvent.mockClear();
    mockWriteSecondary.mockClear();
    mockWriteSecondary.mockResolvedValue({ qdrant: 0, neo4j: 0 });
  });

  it("rejects when signature header is missing", async () => {
    const r = await verifyAndIngest("samsara", null, buildBody());
    expect(r.reason).toBe("missing_signature");
    expect(r.inserted).toBe(0);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("rejects when payload is invalid JSON / shape", async () => {
    const r = await verifyAndIngest("samsara", "abc", "not json");
    expect(r.reason).toBe("invalid_payload");
  });

  it("rejects when device is not registered", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] }); // resolveConnectedVehicle
    const body = buildBody();
    const r = await verifyAndIngest("samsara", sign(body), body);
    expect(r.reason).toBe("device_not_registered");
  });

  it("rejects when provider has no credentials configured", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [baseLink] }) // resolveConnectedVehicle
      .mockResolvedValueOnce({ rows: [] }); // loadProviderSecret
    const body = buildBody();
    const r = await verifyAndIngest("samsara", sign(body), body);
    expect(r.reason).toBe("provider_not_configured");
  });

  it("rejects when VIN doesn't match registered vehicle", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ ...baseLink, vin: "DIFFERENT_VIN1234" }],
    });
    const body = buildBody();
    const r = await verifyAndIngest("samsara", sign(body), body);
    expect(r.reason).toBe("vin_mismatch");
  });

  it("rejects when HMAC signature is wrong", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [baseLink] })
      .mockResolvedValueOnce({
        rows: [{ webhook_secret_encrypted: SECRET }],
      });
    const body = buildBody();
    const wrong = sign(body + "tamper");
    const r = await verifyAndIngest("samsara", wrong, body);
    expect(r.reason).toBe("invalid_signature");
  });

  it("ingests a valid signed payload and counts inserted signals", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [baseLink] }) // resolve
      .mockResolvedValueOnce({
        rows: [{ webhook_secret_encrypted: SECRET }],
      }) // secret
      .mockResolvedValueOnce({ rows: [{ id: "row-1" }] }) // INSERT signal 1
      .mockResolvedValueOnce({ rowCount: 1, rows: [] }) // UPDATE last_seen_at
      .mockResolvedValueOnce({ rowCount: 1, rows: [] }); // UPSERT log
    const body = buildBody();
    const r = await verifyAndIngest("samsara", sign(body), body);
    expect(r.reason).toBeUndefined();
    expect(r.inserted).toBe(1);
    expect(r.deduped).toBe(0);
    expect(r.vin).toBe(VIN);
  });

  it("dedupes a duplicate provider_event_id (ON CONFLICT DO NOTHING)", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [baseLink] }) // resolve
      .mockResolvedValueOnce({
        rows: [{ webhook_secret_encrypted: SECRET }],
      }) // secret
      .mockResolvedValueOnce({ rows: [] }) // INSERT returned no rows (dup)
      .mockResolvedValueOnce({ rowCount: 1, rows: [] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] });
    const body = buildBody();
    const r = await verifyAndIngest("samsara", sign(body), body);
    expect(r.inserted).toBe(0);
    expect(r.deduped).toBe(1);
  });
});

describe("runMaintenanceRules", () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockWriteSecondary.mockClear();
    mockWriteSecondary.mockResolvedValue({ qdrant: 0, neo4j: 0 });
  });

  function emit(rows: any[]) {
    // resolution loadVehicleByVin → loadLatestSignals → for each rule that
    // would fire: hasOpenLead → INSERT
    return rows;
  }

  it("emits oil_change/soon when oil_life < 15%", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [baseLink] }) // loadVehicleByVin
      .mockResolvedValueOnce({
        rows: [
          {
            id: "evt-oil",
            signal_type: "oil_life",
            value: 10,
            value_text: null,
            recorded_at: new Date().toISOString(),
            raw_payload: {},
          },
        ],
      }) // loadLatestSignals
      .mockResolvedValueOnce({ rows: [] }) // hasOpenLead — no dup
      .mockResolvedValueOnce({
        rows: [
          {
            id: "lead-1",
            dealer_id: DEALER,
            vin: VIN,
            customer_id: CUSTOMER,
            lead_type: "oil_change",
            urgency: "soon",
            confidence: 0.9,
            evidence_event_ids: ["evt-oil"],
            suggested_action: "...",
            estimated_revenue_cents: 8900,
            status: "open",
            created_at: new Date().toISOString(),
            last_updated_at: new Date().toISOString(),
            dismissed_at: null,
          },
        ],
      });

    const r = await runMaintenanceRules(VIN);
    expect(r.emitted).toHaveLength(1);
    expect(r.emitted[0].lead_type).toBe("oil_change");
    expect(r.emitted[0].urgency).toBe("soon");
  });

  it("dedupes within 30 days — does not double-emit", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [baseLink] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: "evt-oil",
            signal_type: "oil_life",
            value: 5,
            value_text: null,
            recorded_at: new Date().toISOString(),
            raw_payload: {},
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ id: "existing-lead" }] }); // hasOpenLead → dup

    const r = await runMaintenanceRules(VIN);
    expect(r.emitted).toHaveLength(0);
    expect(r.skipped).toContainEqual(
      expect.objectContaining({
        lead_type: "oil_change",
        urgency: "soon",
        reason: "duplicate_within_30d",
      }),
    );
  });

  it("emits brake_service when brake_wear < 20%", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [baseLink] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: "evt-brake",
            signal_type: "brake_wear",
            value: 12,
            value_text: null,
            recorded_at: new Date().toISOString(),
            raw_payload: {},
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: "lead-2",
            dealer_id: DEALER,
            vin: VIN,
            customer_id: CUSTOMER,
            lead_type: "brake_service",
            urgency: "soon",
            confidence: 0.85,
            evidence_event_ids: ["evt-brake"],
            suggested_action: "...",
            estimated_revenue_cents: 45000,
            status: "open",
            created_at: new Date().toISOString(),
            last_updated_at: new Date().toISOString(),
            dismissed_at: null,
          },
        ],
      });
    const r = await runMaintenanceRules(VIN);
    expect(r.emitted[0].lead_type).toBe("brake_service");
  });

  it("emits battery_replacement when battery < 60%", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [baseLink] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: "evt-batt",
            signal_type: "battery",
            value: 40,
            value_text: null,
            recorded_at: new Date().toISOString(),
            raw_payload: {},
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: "lead-3",
            dealer_id: DEALER,
            vin: VIN,
            customer_id: CUSTOMER,
            lead_type: "battery_replacement",
            urgency: "soon",
            confidence: 0.8,
            evidence_event_ids: ["evt-batt"],
            suggested_action: "...",
            estimated_revenue_cents: 28000,
            status: "open",
            created_at: new Date().toISOString(),
            last_updated_at: new Date().toISOString(),
            dismissed_at: null,
          },
        ],
      });
    const r = await runMaintenanceRules(VIN);
    expect(r.emitted[0].lead_type).toBe("battery_replacement");
  });

  it("emits general_dtc/immediate on any active fault code", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [baseLink] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: "evt-fc",
            signal_type: "fault_code",
            value: null,
            value_text: "P0420",
            recorded_at: new Date().toISOString(),
            raw_payload: {},
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] }) // hasOpenLead — fresh
      .mockResolvedValueOnce({
        rows: [
          {
            id: "lead-4",
            dealer_id: DEALER,
            vin: VIN,
            customer_id: CUSTOMER,
            lead_type: "general_dtc",
            urgency: "immediate",
            confidence: 0.85,
            evidence_event_ids: ["evt-fc"],
            suggested_action: "DTC P0420",
            estimated_revenue_cents: 25000,
            status: "open",
            created_at: new Date().toISOString(),
            last_updated_at: new Date().toISOString(),
            dismissed_at: null,
          },
        ],
      });
    const r = await runMaintenanceRules(VIN);
    expect(r.emitted[0].lead_type).toBe("general_dtc");
    expect(r.emitted[0].urgency).toBe("immediate");
  });

  it("emits tire_replacement when 2+ tires read low", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [baseLink] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: "evt-fl",
            signal_type: "tire_pressure",
            value: 22,
            value_text: null,
            recorded_at: new Date().toISOString(),
            raw_payload: { tire_position: "FL" },
          },
          {
            id: "evt-fr",
            signal_type: "tire_pressure",
            value: 24,
            value_text: null,
            recorded_at: new Date().toISOString(),
            raw_payload: { tire_position: "FR" },
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: "lead-5",
            dealer_id: DEALER,
            vin: VIN,
            customer_id: CUSTOMER,
            lead_type: "tire_replacement",
            urgency: "monitoring",
            confidence: 0.6,
            evidence_event_ids: ["evt-fl", "evt-fr"],
            suggested_action: "Tires low",
            estimated_revenue_cents: 80000,
            status: "open",
            created_at: new Date().toISOString(),
            last_updated_at: new Date().toISOString(),
            dismissed_at: null,
          },
        ],
      });
    const r = await runMaintenanceRules(VIN);
    expect(r.emitted[0].lead_type).toBe("tire_replacement");
  });

  it("emits mileage_milestone when odometer > last_service + 5000", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [baseLink] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: "evt-od",
            signal_type: "odometer",
            value: 65000,
            value_text: null,
            recorded_at: new Date().toISOString(),
            raw_payload: {},
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ mileage: 55000 }] }) // loadLastServiceMileage
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: "lead-6",
            dealer_id: DEALER,
            vin: VIN,
            customer_id: CUSTOMER,
            lead_type: "mileage_milestone",
            urgency: "monitoring",
            confidence: 0.7,
            evidence_event_ids: ["evt-od"],
            suggested_action: "10000 since last service",
            estimated_revenue_cents: 35000,
            status: "open",
            created_at: new Date().toISOString(),
            last_updated_at: new Date().toISOString(),
            dismissed_at: null,
          },
        ],
      });
    const r = await runMaintenanceRules(VIN);
    expect(r.emitted[0].lead_type).toBe("mileage_milestone");
  });

  it("returns empty when VIN isn't connected", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] }); // no link
    const r = await runMaintenanceRules(VIN);
    expect(r.emitted).toEqual([]);
    expect(r.skipped).toEqual([]);
  });

  it("triple-write fan-out failure is non-blocking", async () => {
    mockWriteSecondary.mockRejectedValueOnce(new Error("qdrant down"));
    mockQuery
      .mockResolvedValueOnce({ rows: [baseLink] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: "evt-oil",
            signal_type: "oil_life",
            value: 5,
            value_text: null,
            recorded_at: new Date().toISOString(),
            raw_payload: {},
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: "lead-x",
            dealer_id: DEALER,
            vin: VIN,
            customer_id: CUSTOMER,
            lead_type: "oil_change",
            urgency: "soon",
            confidence: 0.9,
            evidence_event_ids: ["evt-oil"],
            suggested_action: "...",
            estimated_revenue_cents: 8900,
            status: "open",
            created_at: new Date().toISOString(),
            last_updated_at: new Date().toISOString(),
            dismissed_at: null,
          },
        ],
      });
    const r = await runMaintenanceRules(VIN);
    expect(r.emitted).toHaveLength(1);
  });
});

describe("admin operations", () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it("listLeadsForDealer applies status + urgency filters", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    await listLeadsForDealer(DEALER, { status: "open", urgency: "immediate" });
    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toContain("WHERE");
    expect(sql).toContain("status =");
    expect(sql).toContain("urgency =");
    expect(params).toContain(DEALER);
    expect(params).toContain("open");
    expect(params).toContain("immediate");
  });

  it("dismissLead updates status to dismissed and sets dismissed_at", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: "lead-99",
          dealer_id: DEALER,
          vin: VIN,
          customer_id: CUSTOMER,
          lead_type: "oil_change",
          urgency: "soon",
          confidence: 0.9,
          evidence_event_ids: [],
          suggested_action: "...",
          estimated_revenue_cents: 8900,
          status: "dismissed",
          created_at: new Date().toISOString(),
          last_updated_at: new Date().toISOString(),
          dismissed_at: new Date().toISOString(),
        },
      ],
    });
    const r = await dismissLead("lead-99", "duplicate");
    expect(r?.status).toBe("dismissed");
  });

  it("markLeadCompleted sets status to completed", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: "lead-100",
          dealer_id: DEALER,
          vin: VIN,
          customer_id: CUSTOMER,
          lead_type: "brake_service",
          urgency: "soon",
          confidence: 0.85,
          evidence_event_ids: [],
          suggested_action: "...",
          estimated_revenue_cents: 45000,
          status: "completed",
          created_at: new Date().toISOString(),
          last_updated_at: new Date().toISOString(),
          dismissed_at: null,
          outcome: "service_scheduled",
        },
      ],
    });
    const r = await markLeadCompleted("lead-100", "service_scheduled");
    expect(r?.status).toBe("completed");
  });

  it("connectVehicle upserts on (provider, provider_device_id)", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: "cv-id" }] });
    const r = await connectVehicle({
      dealer_id: DEALER,
      customer_id: CUSTOMER,
      vin: VIN,
      provider: "samsara",
      provider_device_id: "dev-2",
    });
    expect(r.id).toBe("cv-id");
    const [sql] = mockQuery.mock.calls[0];
    expect(sql).toContain("ON CONFLICT (provider, provider_device_id)");
  });
});
