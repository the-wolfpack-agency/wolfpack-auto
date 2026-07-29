/**
 * @jest-environment jsdom
 *
 * Recently-viewed session memory — the data behind the homepage resume bar.
 */
import { recordRecentlyViewed, getRecentlyViewed } from "@/lib/recently-viewed";

const KEY = "wolfpack_recently_viewed";

beforeEach(() => {
  window.localStorage.clear();
});

test("records and reads a vehicle", () => {
  recordRecentlyViewed({ vin: "V1", year: 2024, make: "Honda", model: "CR-V", price: 34_000 });
  const got = getRecentlyViewed();
  expect(got).toHaveLength(1);
  expect(got[0].vin).toBe("V1");
  expect(got[0].make).toBe("Honda");
  expect(got[0].viewedAt).toBeGreaterThan(0);
});

test("dedupes by VIN and moves the re-viewed vehicle to the front", () => {
  recordRecentlyViewed({ vin: "A", year: 2023, make: "Ford", model: "F-150", price: 40_000 });
  recordRecentlyViewed({ vin: "B", year: 2024, make: "Kia", model: "Telluride", price: 42_000 });
  recordRecentlyViewed({ vin: "A", year: 2023, make: "Ford", model: "F-150", price: 40_000 });
  const vins = getRecentlyViewed().map((v) => v.vin);
  expect(vins).toEqual(["A", "B"]);
});

test("caps history at 8 most-recent entries", () => {
  for (let i = 0; i < 12; i++) {
    recordRecentlyViewed({ vin: `V${i}`, year: 2024, make: "Make", model: `M${i}`, price: 20_000 + i });
  }
  const got = getRecentlyViewed();
  expect(got).toHaveLength(8);
  // Newest first: last recorded was V11
  expect(got[0].vin).toBe("V11");
  expect(got.some((v) => v.vin === "V0")).toBe(false);
});

test("returns an empty array when storage is corrupt", () => {
  window.localStorage.setItem(KEY, "}{ not json");
  expect(getRecentlyViewed()).toEqual([]);
});

test("returns an empty array when nothing has been viewed", () => {
  expect(getRecentlyViewed()).toEqual([]);
});
