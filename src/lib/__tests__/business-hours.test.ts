import {
  normalizeBusinessHours,
  summarizeBusinessHours,
} from "@/lib/dealer-config";
import { DEFAULT_CONFIG } from "@/lib/dealer-config-shared";

describe("normalizeBusinessHours", () => {
  it("converts the Settings-form array shape into a string map (the prod bug)", () => {
    const raw = [
      { day: "monday", open: "09:00", close: "19:00", closed: false },
      { day: "saturday", open: "09:00", close: "17:00", closed: false },
      { day: "sunday", open: "12:00", close: "17:00", closed: false },
    ];
    const out = normalizeBusinessHours(raw);
    expect(out).toEqual({
      Monday: "09:00 - 19:00",
      Saturday: "09:00 - 17:00",
      Sunday: "12:00 - 17:00",
    });
    // Every value must be a string so it never renders as "[object Object]"
    // or crashes as a React child.
    for (const v of Object.values(out)) expect(typeof v).toBe("string");
  });

  it("renders closed days as 'Closed'", () => {
    const out = normalizeBusinessHours([{ day: "sunday", closed: true }]);
    expect(out).toEqual({ Sunday: "Closed" });
  });

  it("passes through an existing string map unchanged", () => {
    const map = { "Mon-Fri": "9AM-8PM", Sat: "9AM-6PM" };
    expect(normalizeBusinessHours(map)).toEqual(map);
  });

  it("parses a JSON string", () => {
    const out = normalizeBusinessHours(
      JSON.stringify([{ day: "friday", open: "08:00", close: "18:00" }]),
    );
    expect(out).toEqual({ Friday: "08:00 - 18:00" });
  });

  it("falls back to the default for garbage / null", () => {
    expect(normalizeBusinessHours(null)).toEqual(DEFAULT_CONFIG.business_hours);
    expect(normalizeBusinessHours(42)).toEqual(DEFAULT_CONFIG.business_hours);
    expect(normalizeBusinessHours("not json")).toEqual(DEFAULT_CONFIG.business_hours);
  });
});

describe("summarizeBusinessHours", () => {
  it("collapses consecutive same-hours days into ranges (the prod banner)", () => {
    const hours = {
      Monday: "09:00 - 19:00",
      Tuesday: "09:00 - 19:00",
      Wednesday: "09:00 - 19:00",
      Thursday: "09:00 - 19:00",
      Friday: "09:00 - 19:00",
      Saturday: "09:00 - 17:00",
      Sunday: "12:00 - 17:00",
    };
    expect(summarizeBusinessHours(hours)).toBe(
      "Mon-Fri: 09:00 - 19:00  ·  Sat: 09:00 - 17:00  ·  Sun: 12:00 - 17:00",
    );
  });

  it("keeps single days ungrouped", () => {
    expect(summarizeBusinessHours({ Monday: "9-5", Tuesday: "10-6" })).toBe(
      "Mon: 9-5  ·  Tue: 10-6",
    );
  });

  it("returns empty string for no hours", () => {
    expect(summarizeBusinessHours({})).toBe("");
  });
});
