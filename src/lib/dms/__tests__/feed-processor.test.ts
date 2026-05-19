/**
 * DMS Feed Processor — auto background-enqueue tests.
 *
 * Validates Fix 1 (client-deployment polish): when a new vehicle is ingested
 * via the DMS feed processor, a fal.ai background-generation job is enqueued
 * fire-and-forget. Duplicate ingests of the same vehicle with the same primary
 * photo must NOT re-enqueue. Failures in the background queue must NEVER sink
 * the ingest pipeline.
 */

/* eslint-disable @typescript-eslint/no-require-imports */

jest.mock("@/lib/db", () => ({
  query: jest.fn(),
}));

jest.mock("@/lib/cache", () => ({
  cacheInvalidate: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/lib/background-generator", () => ({
  generateBackground: jest.fn().mockResolvedValue("job-id-stub"),
}));

import { query } from "@/lib/db";
import { generateBackground } from "@/lib/background-generator";
import { processFeed } from "@/lib/dms/feed-processor";
import { DMSProvider, type DMSVehicleRecord } from "@/lib/dms/types";

const mockedQuery = query as unknown as jest.Mock;
const mockedGenerate = generateBackground as unknown as jest.Mock;

const DEALER_ID = "11111111-1111-1111-1111-111111111111";
const VEHICLE_ID = "22222222-2222-2222-2222-222222222222";
const VALID_VIN = "1HGBH41JXMN109186";

function makeRecord(overrides: Partial<DMSVehicleRecord> = {}): DMSVehicleRecord {
  return {
    vin: VALID_VIN,
    stock_number: "S1234",
    year: 2024,
    make: "Honda",
    model: "Civic",
    trim: "EX",
    price: 25_000,
    mileage: 12_000,
    condition: "used",
    photos: ["https://cdn.example/photo-1.jpg"],
    ...overrides,
  } as DMSVehicleRecord;
}

beforeEach(() => {
  jest.clearAllMocks();
  process.env.DATABASE_URL = "postgresql://stub";
});

describe("DMS feed-processor — auto background enqueue (Fix 1)", () => {
  test("enqueues a background job after inserting a new vehicle with a primary photo", async () => {
    mockedQuery
      // SELECT existing vehicle -> not found
      .mockResolvedValueOnce({ rows: [] })
      // INSERT vehicle -> success
      .mockResolvedValueOnce({ rows: [] })
      // SELECT stale vins (full sync cleanup)
      .mockResolvedValueOnce({ rows: [] })
      // INSERT dms_feed_logs
      .mockResolvedValueOnce({ rows: [] });

    const result = await processFeed(DEALER_ID, DMSProvider.CDK, [makeRecord()], "full");

    expect(result.vehicles_added).toBe(1);
    expect(result.vehicles_updated).toBe(0);
    expect(result.errors).toHaveLength(0);

    expect(mockedGenerate).toHaveBeenCalledTimes(1);
    expect(mockedGenerate).toHaveBeenCalledWith({
      dealer_id: DEALER_ID,
      vehicle_id: null,
      vin: VALID_VIN,
      source_photo_url: "https://cdn.example/photo-1.jpg",
    });
  });

  test("does NOT re-enqueue when a duplicate ingest brings the same primary photo", async () => {
    // Existing vehicle row whose photos[0] matches the incoming primary photo.
    mockedQuery
      .mockResolvedValueOnce({
        rows: [
          {
            id: VEHICLE_ID,
            photos: ["https://cdn.example/photo-1.jpg"],
          },
        ],
      })
      // UPDATE vehicle
      .mockResolvedValueOnce({ rows: [] })
      // SELECT stale VINs
      .mockResolvedValueOnce({ rows: [] })
      // INSERT dms_feed_logs
      .mockResolvedValueOnce({ rows: [] });

    const result = await processFeed(DEALER_ID, DMSProvider.CDK, [makeRecord()], "full");

    expect(result.vehicles_updated).toBe(1);
    expect(result.vehicles_added).toBe(0);
    expect(mockedGenerate).not.toHaveBeenCalled();
  });

  test("re-enqueues when the primary photo changed since last ingest", async () => {
    mockedQuery
      .mockResolvedValueOnce({
        rows: [
          {
            id: VEHICLE_ID,
            photos: ["https://cdn.example/photo-OLD.jpg"],
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] }) // UPDATE
      .mockResolvedValueOnce({ rows: [] }) // SELECT stale
      .mockResolvedValueOnce({ rows: [] }); // log insert

    const result = await processFeed(
      DEALER_ID,
      DMSProvider.CDK,
      [makeRecord({ photos: ["https://cdn.example/photo-NEW.jpg"] })],
      "full",
    );

    expect(result.vehicles_updated).toBe(1);
    expect(mockedGenerate).toHaveBeenCalledTimes(1);
    expect(mockedGenerate.mock.calls[0][0].source_photo_url).toBe(
      "https://cdn.example/photo-NEW.jpg",
    );
    expect(mockedGenerate.mock.calls[0][0].vehicle_id).toBe(VEHICLE_ID);
  });

  test("does NOT enqueue when the vehicle has no photos", async () => {
    mockedQuery
      .mockResolvedValueOnce({ rows: [] }) // not existing
      .mockResolvedValueOnce({ rows: [] }) // INSERT
      .mockResolvedValueOnce({ rows: [] }) // stale select
      .mockResolvedValueOnce({ rows: [] }); // log

    const result = await processFeed(
      DEALER_ID,
      DMSProvider.CDK,
      [makeRecord({ photos: [] })],
      "full",
    );

    expect(result.vehicles_added).toBe(1);
    expect(mockedGenerate).not.toHaveBeenCalled();
  });

  test("ingest still succeeds when background enqueue throws (fire-and-forget)", async () => {
    mockedGenerate.mockRejectedValueOnce(new Error("fal exploded"));

    mockedQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const result = await processFeed(DEALER_ID, DMSProvider.CDK, [makeRecord()], "full");

    expect(result.vehicles_added).toBe(1);
    expect(result.errors).toHaveLength(0);
    expect(mockedGenerate).toHaveBeenCalledTimes(1);
  });
});
