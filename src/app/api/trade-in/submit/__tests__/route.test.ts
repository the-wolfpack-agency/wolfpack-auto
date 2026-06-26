/**
 * Contract tests for POST /api/trade-in/submit
 *
 * Phone is OPTIONAL in the UI. The form sends "" when it is left blank, which
 * previously failed the regex and returned 422 ("Server error: 422" on the
 * page). These tests lock in: a missing / blank phone is accepted, while a
 * non-empty malformed phone and any missing REQUIRED field are still rejected.
 *
 * DATABASE_URL is unset for the duration so the route takes its no-DB graceful
 * path (200 on valid input) and the assertions are purely about validation.
 */
import { NextRequest } from "next/server";
import { POST } from "@/app/api/trade-in/submit/route";

let savedDbUrl: string | undefined;
beforeAll(() => {
  savedDbUrl = process.env.DATABASE_URL;
  delete process.env.DATABASE_URL;
});
afterAll(() => {
  if (savedDbUrl !== undefined) process.env.DATABASE_URL = savedDbUrl;
});

function submit(body: unknown) {
  return POST(
    new NextRequest("http://localhost/api/trade-in/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

const base = {
  estimate_id: "est_123",
  first_name: "Test",
  last_name: "User",
  email: "test@test.com",
};

describe("POST /api/trade-in/submit — optional phone", () => {
  it("accepts a submission with NO phone field (omitted)", async () => {
    expect((await submit({ ...base })).status).toBe(200);
  });

  it("accepts an empty-string phone (what the form sends when blank) — the reported bug", async () => {
    expect((await submit({ ...base, phone: "" })).status).toBe(200);
  });

  it("accepts a whitespace-only phone as blank", async () => {
    expect((await submit({ ...base, phone: "   " })).status).toBe(200);
  });

  it("accepts a valid E.164 phone", async () => {
    expect((await submit({ ...base, phone: "+15551234567" })).status).toBe(200);
  });

  it("still REJECTS a non-empty malformed phone (422)", async () => {
    expect((await submit({ ...base, phone: "abc" })).status).toBe(422);
  });

  it("still REJECTS when a required field is missing (422)", async () => {
    const { email: _omitted, ...noEmail } = base;
    expect((await submit(noEmail)).status).toBe(422);
  });
});
