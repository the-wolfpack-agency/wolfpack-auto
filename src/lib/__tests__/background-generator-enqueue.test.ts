/**
 * background-generator.generateBackground — DB enqueue contract (Fix 1).
 *
 * Validates:
 *   - DATABASE_URL missing -> shadow skip, no insert.
 *   - FAL_API_KEY missing  -> log + skip silently, no insert.
 *   - Duplicate (same source_photo_url + completed/active job) -> skip.
 *   - Brand-new vehicle (no prior job) -> insert with status='queued'.
 *   - DB error -> returns null (never throws).
 */

/* eslint-disable @typescript-eslint/no-require-imports */

jest.mock("@/lib/db", () => ({
  query: jest.fn(),
}));

import { query } from "@/lib/db";
import { generateBackground } from "@/lib/background-generator";

const mockedQuery = query as unknown as jest.Mock;

const DEALER_ID = "11111111-1111-1111-1111-111111111111";
const VEHICLE_ID = "22222222-2222-2222-2222-222222222222";
const PHOTO = "https://cdn.example/photo-1.jpg";
const VIN = "1HGBH41JXMN109186";

beforeEach(() => {
  jest.clearAllMocks();
  process.env.DATABASE_URL = "postgresql://stub";
  process.env.FAL_API_KEY = "fal_stub_key";
});

afterEach(() => {
  delete process.env.FAL_API_KEY;
  delete process.env.FAL_KEY;
});

describe("generateBackground — enqueue", () => {
  test("returns 'skipped' when DATABASE_URL is unset (shadow mode)", async () => {
    delete process.env.DATABASE_URL;
    const result = await generateBackground({
      dealer_id: DEALER_ID,
      vehicle_id: VEHICLE_ID,
      vin: VIN,
      source_photo_url: PHOTO,
    });
    expect(result).toBe("skipped");
    expect(mockedQuery).not.toHaveBeenCalled();
  });

  test("returns 'skipped' when FAL_API_KEY is unset (logs + skips, no insert)", async () => {
    delete process.env.FAL_API_KEY;
    delete process.env.FAL_KEY;
    const result = await generateBackground({
      dealer_id: DEALER_ID,
      vehicle_id: VEHICLE_ID,
      vin: VIN,
      source_photo_url: PHOTO,
    });
    expect(result).toBe("skipped");
    expect(mockedQuery).not.toHaveBeenCalled();
  });

  test("returns 'skipped' when no source photo URL is provided", async () => {
    const result = await generateBackground({
      dealer_id: DEALER_ID,
      vehicle_id: VEHICLE_ID,
      vin: VIN,
      source_photo_url: "",
    });
    expect(result).toBe("skipped");
    expect(mockedQuery).not.toHaveBeenCalled();
  });

  test("inserts a queued background_jobs row when no existing job matches", async () => {
    mockedQuery
      .mockResolvedValueOnce({ rows: [] }) // existing-job lookup
      .mockResolvedValueOnce({ rows: [{ id: "job-1" }] }); // INSERT RETURNING

    const result = await generateBackground({
      dealer_id: DEALER_ID,
      vehicle_id: VEHICLE_ID,
      vin: VIN,
      source_photo_url: PHOTO,
    });

    expect(result).toBe("job-1");
    expect(mockedQuery).toHaveBeenCalledTimes(2);
    const insertCall = mockedQuery.mock.calls[1];
    expect(insertCall[0]).toMatch(/INSERT INTO background_jobs/);
    expect(insertCall[0]).toMatch(/'queued'/);
    expect(insertCall[1]).toEqual([DEALER_ID, VEHICLE_ID, VIN, PHOTO]);
  });

  test("returns 'skipped' when an existing job already covers this vehicle+photo", async () => {
    mockedQuery.mockResolvedValueOnce({ rows: [{ id: "existing-job" }] });

    const result = await generateBackground({
      dealer_id: DEALER_ID,
      vehicle_id: VEHICLE_ID,
      vin: VIN,
      source_photo_url: PHOTO,
    });

    expect(result).toBe("skipped");
    expect(mockedQuery).toHaveBeenCalledTimes(1);
  });

  test("returns null and never throws when the DB blows up", async () => {
    mockedQuery.mockRejectedValueOnce(new Error("pg down"));
    const result = await generateBackground({
      dealer_id: DEALER_ID,
      vehicle_id: VEHICLE_ID,
      vin: VIN,
      source_photo_url: PHOTO,
    });
    expect(result).toBeNull();
  });

  test("skips the de-dupe lookup when vehicle_id is null and still enqueues", async () => {
    mockedQuery.mockResolvedValueOnce({ rows: [{ id: "job-2" }] });

    const result = await generateBackground({
      dealer_id: DEALER_ID,
      vehicle_id: null,
      vin: VIN,
      source_photo_url: PHOTO,
    });

    expect(result).toBe("job-2");
    expect(mockedQuery).toHaveBeenCalledTimes(1);
  });
});
